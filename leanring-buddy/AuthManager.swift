// MARK: - Skilly
//
//  AuthManager.swift
//  leanring-buddy
//
//  Handles WorkOS AuthKit authentication flow:
//  1. Opens browser to WorkOS login page
//  2. Catches the skilly://auth/callback deep link
//  3. Exchanges the auth code for user profile via the Worker proxy
//  4. Stores user session in Keychain
//

import Combine
import Foundation
import PostHog
import Security
import SwiftUI

/// Represents an authenticated Skilly user.
struct SkillyUser: Codable, Sendable {
    let id: String
    let email: String
    let firstName: String?
    let lastName: String?

    var displayName: String {
        if let first = firstName, !first.isEmpty {
            return first
        }
        return email
    }
}

/// Manages authentication state and the WorkOS AuthKit login flow.
@MainActor
final class AuthManager: ObservableObject {
    @Published private(set) var currentUser: SkillyUser?
    // MARK: - Skilly
    @Published private(set) var isAuthenticated: Bool = false
    @Published private(set) var isAuthenticating: Bool = false
    @Published private(set) var authError: String?

    private static let keychainServiceName = "app.tryskilly.skilly.auth"
    private static let keychainAccessTokenKey = "accessToken"
    private static let keychainRefreshTokenKey = "refreshToken"
    private static let keychainUserKey = "currentUser"

    var isSignedIn: Bool {
        currentUser != nil
    }

    private var workerBaseURL: String {
        UserDefaults.standard.string(forKey: "workerBaseURL")
            ?? "https://skilly-proxy.eng-mohamedszaied.workers.dev"
    }

    init() {
        loadStoredUser()
    }

    // MARK: - Sign In Flow

    /// Opens the WorkOS AuthKit login page in the user's default browser.
    /// The auth flow continues when the app receives the skilly://auth/callback deep link.
    func startSignIn() {
        isAuthenticating = true
        authError = nil

        Task {
            do {
                // Get the auth URL from the Worker
                let url = URL(string: "\(workerBaseURL)/auth/url")!
                let (data, _) = try await URLSession.shared.data(from: url)
                let response = try JSONDecoder().decode(AuthURLResponse.self, from: data)

                // Open in browser
                if let authURL = URL(string: response.url) {
                    NSWorkspace.shared.open(authURL)
                }
            } catch {
                isAuthenticating = false
                authError = "Failed to start sign in: \(error.localizedDescription)"
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("⚠️ Skilly Auth: Failed to get auth URL: \(error)")
                #endif
            }
        }
    }

    /// Called when the app receives the skilly://auth/callback?code=XXX deep link.
    /// Exchanges the authorization code for a user profile via the Worker proxy.
    func handleAuthCallback(code: String) {
        isAuthenticating = true
        authError = nil

        Task {
            do {
                let url = URL(string: "\(workerBaseURL)/auth/token")!
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONEncoder().encode(["code": code])

                let (data, response) = try await URLSession.shared.data(for: request)

                guard let httpResponse = response as? HTTPURLResponse else {
                    throw AuthError.invalidResponse
                }

                guard httpResponse.statusCode == 200 else {
                    let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
                    throw AuthError.serverError(statusCode: httpResponse.statusCode, message: errorBody)
                }

                let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)

                // Store tokens in Keychain
                saveToKeychain(key: Self.keychainAccessTokenKey, value: authResponse.accessToken)
                if let refreshToken = authResponse.refreshToken {
                    saveToKeychain(key: Self.keychainRefreshTokenKey, value: refreshToken)
                }

                // Store user profile
                let userData = try JSONEncoder().encode(authResponse.user)
                saveToKeychain(key: Self.keychainUserKey, value: String(data: userData, encoding: .utf8) ?? "")

                currentUser = authResponse.user
                isAuthenticated = true
                isAuthenticating = false
                authError = nil

                let user = authResponse.user
                let signupDate = ISO8601DateFormatter().string(from: Date())
                PostHogSDK.shared.identify(
                    user.id,
                    userProperties: [
                        "email": user.email,
                        "beta_cohort": true,
                        "signup_date": signupDate,
                        "plan_tier": "flat"
                    ]
                )

                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("🎯 Skilly Auth: Signed in as \(authResponse.user.email)")
                #endif

            } catch {
                isAuthenticating = false
                authError = "Sign in failed: \(error.localizedDescription)"
                // MARK: - Skilly — Debug logging (stripped in release)
                #if DEBUG
                print("⚠️ Skilly Auth: Token exchange failed: \(error)")
                #endif
            }
        }
    }

    // MARK: - Sign Out

    func signOut() {
        deleteFromKeychain(key: Self.keychainAccessTokenKey)
        deleteFromKeychain(key: Self.keychainRefreshTokenKey)
        deleteFromKeychain(key: Self.keychainUserKey)
        currentUser = nil
        isAuthenticated = false
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🎯 Skilly Auth: Signed out")
        #endif
    }

    // MARK: - Skilly — Token Refresh

    func refreshAccessToken() async throws {
        guard let refreshToken = loadFromKeychain(key: Self.keychainRefreshTokenKey) else {
            signOut()
            throw AuthError.noRefreshToken
        }

        let url = URL(string: "\(workerBaseURL)/auth/token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            signOut()
            throw AuthError.refreshFailed
        }

        let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
        saveToKeychain(key: Self.keychainAccessTokenKey, value: authResponse.accessToken)

        if let newRefreshToken = authResponse.refreshToken {
            saveToKeychain(key: Self.keychainRefreshTokenKey, value: newRefreshToken)
        }

        let userData = try JSONEncoder().encode(authResponse.user)
        saveToKeychain(key: Self.keychainUserKey, value: String(data: userData, encoding: .utf8) ?? "")

        currentUser = authResponse.user
        isAuthenticated = true
    }

    // MARK: - Stored Session

    private func loadStoredUser() {
        guard let userJSON = loadFromKeychain(key: Self.keychainUserKey),
              let userData = userJSON.data(using: .utf8),
              let user = try? JSONDecoder().decode(SkillyUser.self, from: userData) else {
            return
        }
        currentUser = user
        isAuthenticated = true
        // MARK: - Skilly — Debug logging (stripped in release)
        #if DEBUG
        print("🎯 Skilly Auth: Restored session for \(user.email)")
        #endif
    }

    // MARK: - Keychain Helpers

    private func saveToKeychain(key: String, value: String) {
        let data = Data(value.utf8)

        // Delete existing item first
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainServiceName,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // MARK: - Skilly — ThisDeviceOnly prevents token migration to other devices
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainServiceName,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        SecItemAdd(addQuery as CFDictionary, nil)
    }

    private func loadFromKeychain(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainServiceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    private func deleteFromKeychain(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainServiceName,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Response Models

    private struct AuthURLResponse: Codable {
        let url: String
    }

    private struct AuthResponse: Codable {
        let user: SkillyUser
        let accessToken: String
        let refreshToken: String?
    }

    // MARK: - Errors

    enum AuthError: Error, LocalizedError {
        case invalidResponse
        case serverError(statusCode: Int, message: String)
        case noRefreshToken
        case refreshFailed

        var errorDescription: String? {
            switch self {
            case .invalidResponse:
                return "Invalid response from server"
            case .serverError(let code, let message):
                return "Server error (\(code)): \(message)"
            case .noRefreshToken:
                return "No refresh token available"
            case .refreshFailed:
                return "Failed to refresh access token"
            }
        }
    }
}

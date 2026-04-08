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

import Foundation
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
    @Published private(set) var isAuthenticating: Bool = false
    @Published private(set) var authError: String?

    private static let workerBaseURL = "https://skilly-proxy.eng-mohamedszaied.workers.dev"
    private static let keychainServiceName = "app.tryskilly.skilly.auth"
    private static let keychainAccessTokenKey = "accessToken"
    private static let keychainRefreshTokenKey = "refreshToken"
    private static let keychainUserKey = "currentUser"

    var isSignedIn: Bool {
        currentUser != nil
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
                let url = URL(string: "\(Self.workerBaseURL)/auth/url")!
                let (data, _) = try await URLSession.shared.data(from: url)
                let response = try JSONDecoder().decode(AuthURLResponse.self, from: data)

                // Open in browser
                if let authURL = URL(string: response.url) {
                    NSWorkspace.shared.open(authURL)
                }
            } catch {
                isAuthenticating = false
                authError = "Failed to start sign in: \(error.localizedDescription)"
                print("⚠️ Skilly Auth: Failed to get auth URL: \(error)")
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
                let url = URL(string: "\(Self.workerBaseURL)/auth/token")!
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

                let authResponse = try JSONDecoder().decode(AuthTokenResponse.self, from: data)

                // Store tokens in Keychain
                saveToKeychain(key: Self.keychainAccessTokenKey, value: authResponse.accessToken)
                saveToKeychain(key: Self.keychainRefreshTokenKey, value: authResponse.refreshToken)

                // Store user profile
                let userData = try JSONEncoder().encode(authResponse.user)
                saveToKeychain(key: Self.keychainUserKey, value: String(data: userData, encoding: .utf8) ?? "")

                currentUser = authResponse.user
                isAuthenticating = false
                authError = nil

                print("🎯 Skilly Auth: Signed in as \(authResponse.user.email)")

            } catch {
                isAuthenticating = false
                authError = "Sign in failed: \(error.localizedDescription)"
                print("⚠️ Skilly Auth: Token exchange failed: \(error)")
            }
        }
    }

    // MARK: - Sign Out

    func signOut() {
        deleteFromKeychain(key: Self.keychainAccessTokenKey)
        deleteFromKeychain(key: Self.keychainRefreshTokenKey)
        deleteFromKeychain(key: Self.keychainUserKey)
        currentUser = nil
        print("🎯 Skilly Auth: Signed out")
    }

    // MARK: - Stored Session

    private func loadStoredUser() {
        guard let userJSON = loadFromKeychain(key: Self.keychainUserKey),
              let userData = userJSON.data(using: .utf8),
              let user = try? JSONDecoder().decode(SkillyUser.self, from: userData) else {
            return
        }
        currentUser = user
        print("🎯 Skilly Auth: Restored session for \(user.email)")
    }

    // MARK: - Keychain Helpers

    private func saveToKeychain(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }

        // Delete existing item first
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainServiceName,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // Add new item
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainServiceName,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
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

    private struct AuthTokenResponse: Codable {
        let user: SkillyUser
        let accessToken: String
        let refreshToken: String
    }

    // MARK: - Errors

    enum AuthError: Error, LocalizedError {
        case invalidResponse
        case serverError(statusCode: Int, message: String)

        var errorDescription: String? {
            switch self {
            case .invalidResponse:
                return "Invalid response from server"
            case .serverError(let code, let message):
                return "Server error (\(code)): \(message)"
            }
        }
    }
}

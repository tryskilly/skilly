// MARK: - Skilly
//
//  PanelNavigator.swift
//  leanring-buddy
//
//  Navigation state for the menu bar panel. Drives transitions between
//  the main view and sub-views like the Skills Library.
//

import Combine
import SwiftUI

@MainActor
final class PanelNavigator: ObservableObject {
    enum Screen: Equatable {
        case main
        case skillsLibrary
    }

    @Published var currentScreen: Screen = .main

    func push(_ screen: Screen) {
        withAnimation(.easeInOut(duration: 0.22)) {
            currentScreen = screen
        }
    }

    func popToMain() {
        withAnimation(.easeInOut(duration: 0.22)) {
            currentScreen = .main
        }
    }
}

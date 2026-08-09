// MARK: - Skilly
//
//  ConversationHistoryView.swift
//  leanring-buddy
//
//  Reopenable local history for typed and spoken Skilly conversations.

import Foundation
import SwiftUI

struct ConversationHistoryView: View {
    @ObservedObject var conversationHistoryStore: ConversationHistoryStore
    let replayingConversationTurnID: UUID?
    let showTurnBesideCursor: (ConversationTurn) -> Void
    let replayTurnAudio: (ConversationTurn) -> Void
    let clearHistory: () -> Void

    @State private var isConfirmingClearHistory = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            historyHeader

            Divider()
                .background(DS.Colors.borderSubtle)

            if conversationHistoryStore.turns.isEmpty {
                emptyState
            } else {
                ScrollViewReader { scrollViewProxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(conversationHistoryStore.turns.reversed()) { conversationTurn in
                                conversationTurnView(conversationTurn)
                                    .id(conversationTurn.id)
                            }
                        }
                        .padding(14)
                    }
                    .onAppear {
                        if let latestConversationTurn = conversationHistoryStore.turns.last {
                            scrollViewProxy.scrollTo(latestConversationTurn.id, anchor: .top)
                        }
                    }
                }
            }
        }
        .frame(width: 380, height: 460)
        .background(DS.Colors.background)
        .preferredColorScheme(.dark)
        .confirmationDialog(
            "Clear conversation history?",
            isPresented: $isConfirmingClearHistory,
            titleVisibility: .visible
        ) {
            Button("Clear History", role: .destructive) {
                clearHistory()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes locally stored messages and replay audio from this Mac.")
        }
    }

    private var historyHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Conversation history")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(DS.Colors.textPrimary)
                Text("Stored only on this Mac")
                    .font(.system(size: 10))
                    .foregroundColor(DS.Colors.textTertiary)
            }

            Spacer()

            if !conversationHistoryStore.turns.isEmpty {
                Button("Clear") {
                    isConfirmingClearHistory = true
                }
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(DS.Colors.textTertiary)
                .pointerCursor()
                .accessibilityHint("Removes all locally stored messages and replay audio")
            }
        }
        .padding(14)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "text.bubble")
                .font(.system(size: 24, weight: .light))
                .foregroundColor(DS.Colors.textTertiary)
            Text("Your conversations will appear here")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(DS.Colors.textSecondary)
            Text("Ask by voice or type a question. Skilly keeps the completed conversation locally so you can return to it.")
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textTertiary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 270)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }

    private func conversationTurnView(_ conversationTurn: ConversationTurn) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 6) {
                Image(systemName: conversationTurn.inputMode == .voice ? "mic.fill" : "keyboard")
                    .font(.system(size: 9, weight: .semibold))
                Text(conversationTurn.inputMode == .voice ? "VOICE" : "TYPED")
                    .font(.system(size: 9, weight: .semibold, design: .rounded))
                    .tracking(0.5)
                Spacer()
                Text(conversationTurn.createdAt, style: .relative)
                    .font(.system(size: 9))
            }
            .foregroundColor(DS.Colors.textTertiary)

            messageBlock(label: "You", text: conversationTurn.userMessage, isAssistant: false)
            messageBlock(label: "Skilly", text: conversationTurn.assistantMessage, isAssistant: true)

            HStack(spacing: 12) {
                Button {
                    showTurnBesideCursor(conversationTurn)
                } label: {
                    Label("Show by cursor", systemImage: "cursorarrow.motionlines")
                }
                .buttonStyle(.plain)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(DS.Colors.accentText)
                .pointerCursor()

                if conversationTurn.hasReplayableAudio {
                    Button {
                        replayTurnAudio(conversationTurn)
                    } label: {
                        Label(
                            replayingConversationTurnID == conversationTurn.id ? "Playing" : "Replay audio",
                            systemImage: replayingConversationTurnID == conversationTurn.id ? "speaker.wave.2.fill" : "play.fill"
                        )
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(DS.Colors.textSecondary)
                    .pointerCursor()
                }
            }
        }
        .padding(12)
        .background(DS.Colors.surfaceSecondary)
        .clipShape(RoundedRectangle(cornerRadius: DS.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: DS.CornerRadius.large, style: .continuous)
                .stroke(DS.Colors.borderSubtle, lineWidth: 0.7)
        }
    }

    private func messageBlock(label: String, text: String, isAssistant: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(isAssistant ? DS.Colors.accentText : DS.Colors.textTertiary)
            Text(text)
                .font(.system(size: 11))
                .foregroundColor(DS.Colors.textSecondary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

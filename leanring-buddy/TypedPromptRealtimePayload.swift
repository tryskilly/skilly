// MARK: - Skilly
//
//  TypedPromptRealtimePayload.swift
//  leanring-buddy
//
//  Deterministic event construction for typed, screen-aware Realtime turns.

import Foundation

struct RealtimeScreenshotInput {
    let jpegData: Data
    let description: String
}

enum TypedPromptRealtimePayload {
    /// Each screenshot is kept in its own bounded WebSocket frame. The typed
    /// question is sent last so the response cannot race ahead of its context.
    static func makeEvents(
        text: String,
        screenshots: [RealtimeScreenshotInput]
    ) -> (conversationItems: [[String: Any]], responseRequest: [String: Any]) {
        var conversationItems = screenshots.map { screenshot in
            [
                "type": "conversation.item.create",
                "item": [
                    "type": "message",
                    "role": "user",
                    "content": [
                        ["type": "input_text", "text": screenshot.description],
                        [
                            "type": "input_image",
                            "image_url": "data:image/jpeg;base64,\(screenshot.jpegData.base64EncodedString())"
                        ],
                    ],
                ],
            ] as [String: Any]
        }
        conversationItems.append([
            "type": "conversation.item.create",
            "item": [
                "type": "message",
                "role": "user",
                "content": [
                    ["type": "input_text", "text": text]
                ],
            ],
        ])

        return (
            conversationItems: conversationItems,
            responseRequest: [
                "type": "response.create",
                "response": [
                    "output_modalities": ["audio"]
                ]
            ]
        )
    }
}

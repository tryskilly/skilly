import Foundation

/// OpenAI Realtime API pricing constants.
enum RealtimePricing {
    // Audio input: $32.00 per million tokens (gpt-realtime GA)
    static let audioInputCostPerMillion: Double = 32.00
    // Audio output: $64.00 per million tokens
    static let audioOutputCostPerMillion: Double = 64.00
    // Text input: $4.00 per million tokens
    static let textInputCostPerMillion: Double = 4.00
    // Text output: $16.00 per million tokens
    static let textOutputCostPerMillion: Double = 16.00

    static func cost(
        audioInputTokens: Int,
        audioOutputTokens: Int,
        textInputTokens: Int,
        textOutputTokens: Int
    ) -> Double {
        let audioIn = Double(audioInputTokens) * audioInputCostPerMillion / 1_000_000
        let audioOut = Double(audioOutputTokens) * audioOutputCostPerMillion / 1_000_000
        let textIn = Double(textInputTokens) * textInputCostPerMillion / 1_000_000
        let textOut = Double(textOutputTokens) * textOutputCostPerMillion / 1_000_000
        return audioIn + audioOut + textIn + textOut
    }

    static func turnCost(
        audioInputTokens: Int?,
        audioOutputTokens: Int?,
        textInputTokens: Int?,
        textOutputTokens: Int?
    ) -> Double {
        cost(
            audioInputTokens: audioInputTokens ?? 0,
            audioOutputTokens: audioOutputTokens ?? 0,
            textInputTokens: textInputTokens ?? 0,
            textOutputTokens: textOutputTokens ?? 0
        )
    }
}

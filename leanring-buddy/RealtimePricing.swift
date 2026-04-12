import Foundation

/// OpenAI Realtime API pricing constants.
enum RealtimePricing {
    static let audioInputCostPerMillion: Double = 32.00
    static let audioOutputCostPerMillion: Double = 64.00
    static let textInputCostPerMillion: Double = 4.00
    static let textOutputCostPerMillion: Double = 16.00
    static let cachedInputCostPerMillion: Double = 0.40

    static func cost(
        audioInputTokens: Int,
        audioOutputTokens: Int,
        textInputTokens: Int,
        textOutputTokens: Int,
        cachedInputTokens: Int = 0
    ) -> Double {
        let audioIn = Double(audioInputTokens) * audioInputCostPerMillion / 1_000_000
        let audioOut = Double(audioOutputTokens) * audioOutputCostPerMillion / 1_000_000
        let nonCachedTextIn = max(0, textInputTokens - cachedInputTokens)
        let textIn = Double(nonCachedTextIn) * textInputCostPerMillion / 1_000_000
        let cachedIn = Double(cachedInputTokens) * cachedInputCostPerMillion / 1_000_000
        let textOut = Double(textOutputTokens) * textOutputCostPerMillion / 1_000_000
        return audioIn + audioOut + textIn + cachedIn + textOut
    }

    static func turnCost(
        audioInputTokens: Int?,
        audioOutputTokens: Int?,
        textInputTokens: Int?,
        textOutputTokens: Int?,
        cachedInputTokens: Int? = nil
    ) -> Double {
        cost(
            audioInputTokens: audioInputTokens ?? 0,
            audioOutputTokens: audioOutputTokens ?? 0,
            textInputTokens: textInputTokens ?? 0,
            textOutputTokens: textOutputTokens ?? 0,
            cachedInputTokens: cachedInputTokens ?? 0
        )
    }
}

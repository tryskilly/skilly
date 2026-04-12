import SwiftUI

struct TrialExhaustedModal: View {
    @Binding var isPresented: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "clock.badge.exclamationmark")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(DS.Colors.destructive)
                Spacer()
                Button(action: { isPresented = false }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(DS.Colors.textTertiary)
                }
                .buttonStyle(.plain)
                .pointerCursor()
            }

            Text("Free Trial Ended")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(DS.Colors.textPrimary)

            Text("You've used all 15 minutes of your free trial. Subscribe to keep learning with Skilly.")
                .font(.system(size: 13))
                .foregroundColor(DS.Colors.textSecondary)
                .lineSpacing(2)

            Spacer()
                .frame(height: 8)

            Button(action: {
                Task {
                    await EntitlementManager.shared.startCheckout()
                    isPresented = false
                }
            }) {
                Text("Start Subscription")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(DS.Colors.blue400)
                    .cornerRadius(DS.CornerRadius.medium)
            }
            .buttonStyle(.plain)
            .pointerCursor()

            Button(action: { isPresented = false }) {
                Text("Maybe Later")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(DS.Colors.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.plain)
            .pointerCursor()
        }
        .padding(24)
        .frame(width: 300)
        .background(DS.Colors.background)
    }
}

import SwiftUI

struct CapReachedModal: View {
    @Binding var isPresented: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(DS.Colors.warning)
                Spacer()
                Button(action: { isPresented = false }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(DS.Colors.textTertiary)
                }
                .buttonStyle(.plain)
                .pointerCursor()
            }

            Text("Monthly Limit Reached")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(DS.Colors.textPrimary)

            Text("You've hit your 3-hour monthly limit. Upgrade to continue your learning session without interruption.")
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
                Text("Upgrade Plan")
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

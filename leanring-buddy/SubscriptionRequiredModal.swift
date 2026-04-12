import SwiftUI

struct SubscriptionRequiredModal: View {
    @Binding var isPresented: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "creditcard")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(DS.Colors.blue400)
                Spacer()
                Button(action: { isPresented = false }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(DS.Colors.textTertiary)
                }
                .buttonStyle(.plain)
                .pointerCursor()
            }

            Text("Subscription Required")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(DS.Colors.textPrimary)

            Text("An active subscription is needed to use Skilly. Start your free trial or subscribe today.")
                .font(.system(size: 13))
                .foregroundColor(DS.Colors.textSecondary)
                .lineSpacing(2)

            Spacer()
                .frame(height: 8)

            Button(action: {
                EntitlementManager.shared.beginFreeTrial()
                isPresented = false
            }) {
                Text("Start Free Trial")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(DS.Colors.blue400)
                    .cornerRadius(DS.CornerRadius.medium)
            }
            .buttonStyle(.plain)
            .pointerCursor()

            Button(action: {
                Task {
                    await EntitlementManager.shared.startCheckout()
                    isPresented = false
                }
            }) {
                Text("Subscribe")
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

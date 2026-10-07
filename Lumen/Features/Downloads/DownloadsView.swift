import SwiftUI

struct DownloadsView: View {
    @Environment(DownloadManager.self) private var downloads
    @Environment(NetworkMonitor.self) private var network
    @State private var confirmDeleteAll = false

    var body: some View {
        @Bindable var downloads = downloads
        List {
            Section {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    HStack {
                        Text("Storage used").font(Theme.Typography.bodyEmphasis)
                        Spacer()
                        Text(ByteCountFormatter.string(fromByteCount: downloads.totalBytes, countStyle: .file))
                            .monospacedDigit()
                            .foregroundStyle(Theme.Palette.textSecondary)
                    }
                    if let capacity = availableCapacity {
                        LinearProgress(value: Double(downloads.totalBytes) / Double(max(capacity + downloads.totalBytes, 1)))
                        Text("\(ByteCountFormatter.string(fromByteCount: capacity, countStyle: .file)) available on this device")
                            .font(Theme.Typography.caption)
                            .foregroundStyle(Theme.Palette.textSecondary)
                    }
                }
                .padding(.vertical, Theme.Spacing.xs)
                Toggle("Download over Wi-Fi only", isOn: $downloads.wifiOnly)
            } footer: {
                if !network.isConnected {
                    Text("You're offline. Downloaded content is still available, and progress will sync when you reconnect.")
                } else if let error = downloads.lastError {
                    Text(error)
                }
            }

            if downloads.items.isEmpty {
                Section {
                    EmptyStateView(symbol: "arrow.down.circle", title: "No downloads yet",
                                   message: "Download lessons, e-books and quiz sets to study without an internet connection.")
                }
            } else {
                ForEach(DownloadKind.allCases, id: \.self) { kind in
                    let items = downloads.items.filter { $0.kind == kind }
                    if !items.isEmpty {
                        Section(kind.title) {
                            ForEach(items, id: \.key) { item in
                                DownloadRow(item: item)
                                    .swipeActions {
                                        Button(role: .destructive) { downloads.delete(item) } label: { Label("Delete", systemImage: "trash") }
                                    }
                            }
                        }
                    }
                }
                Section {
                    Button("Delete all downloads", role: .destructive) { confirmDeleteAll = true }
                }
            }
        }
        .navigationTitle("Downloads")
        .confirmationDialog("Delete all downloads?", isPresented: $confirmDeleteAll, titleVisibility: .visible) {
            Button("Delete all", role: .destructive) { downloads.deleteAll() }
        } message: {
            Text("Your progress is kept. You can download items again at any time.")
        }
    }

    private var availableCapacity: Int64? {
        let values = try? URL.homeDirectory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        return values?.volumeAvailableCapacityForImportantUsage
    }
}

private struct DownloadRow: View {
    let item: DownloadedItem

    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            Image(systemName: item.kind.symbol)
                .foregroundStyle(Theme.Palette.brand)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).lineLimit(2)
                if let subtitle = item.subtitle {
                    Text(subtitle).font(.caption).foregroundStyle(Theme.Palette.textSecondary)
                }
                switch item.state {
                case .downloading, .queued:
                    ProgressView(value: item.progress).tint(Theme.Palette.brand)
                case .failed, .paused:
                    Text(item.errorMessage ?? "Download failed").font(.caption).foregroundStyle(Theme.Palette.danger)
                case .completed:
                    Text(ByteCountFormatter.string(fromByteCount: item.byteSize, countStyle: .file))
                        .font(.caption).foregroundStyle(Theme.Palette.textTertiary)
                }
            }
            Spacer()
            if item.state == .completed {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.Palette.success)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

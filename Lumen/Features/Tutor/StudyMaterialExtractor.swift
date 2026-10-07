import Foundation
import UIKit
import Vision
import PDFKit

/// Extracts text from uploaded study material entirely on device, so only text
/// (never the original photo or file) is sent to the tutor.
enum StudyMaterialExtractor {
    static let maxCharacters = 20_000

    static func text(fromImageData data: Data) async throws -> String {
        guard let image = UIImage(data: data)?.cgImage else { throw APIError.invalidResponse }
        return try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error { continuation.resume(throwing: error); return }
                let lines = (request.results as? [VNRecognizedTextObservation])?
                    .compactMap { $0.topCandidates(1).first?.string } ?? []
                continuation.resume(returning: clamp(lines.joined(separator: "\n")))
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            DispatchQueue.global(qos: .userInitiated).async {
                do { try VNImageRequestHandler(cgImage: image).perform([request]) }
                catch { continuation.resume(throwing: error) }
            }
        }
    }

    static func text(fromFile url: URL) throws -> String {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        if url.pathExtension.lowercased() == "pdf" {
            guard let document = PDFDocument(url: url) else { throw APIError.invalidResponse }
            return clamp(document.string ?? "")
        }
        return clamp(try String(contentsOf: url, encoding: .utf8))
    }

    private static func clamp(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.count > maxCharacters ? String(trimmed.prefix(maxCharacters)) : trimmed
    }
}

import Foundation

/// Immutable PostgREST query builder: `client.from("courses").select("*").eq("id", id).single()`.
struct PostgrestQuery: Sendable {
    fileprivate let client: SupabaseClient
    let table: String
    private var query: [URLQueryItem] = []
    private var headers: [String: String] = [:]

    init(client: SupabaseClient, table: String) {
        self.client = client
        self.table = table
    }

    // MARK: Shaping

    func select(_ columns: String = "*") -> Self { adding("select", columns) }

    func eq(_ column: String, _ value: some CustomStringConvertible) -> Self { adding(column, "eq.\(value)") }
    func neq(_ column: String, _ value: some CustomStringConvertible) -> Self { adding(column, "neq.\(value)") }
    func gt(_ column: String, _ value: some CustomStringConvertible) -> Self { adding(column, "gt.\(value)") }
    func gte(_ column: String, _ value: some CustomStringConvertible) -> Self { adding(column, "gte.\(value)") }
    func lt(_ column: String, _ value: some CustomStringConvertible) -> Self { adding(column, "lt.\(value)") }
    func lte(_ column: String, _ value: some CustomStringConvertible) -> Self { adding(column, "lte.\(value)") }
    func isNull(_ column: String) -> Self { adding(column, "is.null") }
    func ilike(_ column: String, _ pattern: String) -> Self { adding(column, "ilike.\(pattern)") }

    func `in`<V: CustomStringConvertible>(_ column: String, _ values: [V]) -> Self {
        let list = values.map { "\"\($0)\"" }.joined(separator: ",")
        return adding(column, "in.(\(list))")
    }

    func or(_ expression: String) -> Self { adding("or", "(\(expression))") }

    func order(_ column: String, ascending: Bool = true, nullsLast: Bool = true) -> Self {
        adding("order", "\(column).\(ascending ? "asc" : "desc")\(nullsLast ? ".nullslast" : ".nullsfirst")")
    }

    func limit(_ count: Int) -> Self { adding("limit", "\(count)") }
    func offset(_ count: Int) -> Self { adding("offset", "\(count)") }

    func filter(_ column: String, _ op: String, _ value: String) -> Self { adding(column, "\(op).\(value)") }

    // MARK: Reading

    func execute<T: Decodable>(_ type: T.Type = T.self) async throws -> [T] {
        let data = try await client.send(path: "rest/v1/\(table)", method: "GET", query: query, headers: headers)
        return try client.decode([T].self, from: data)
    }

    /// Returns exactly one row or throws `.notFound`.
    func single<T: Decodable>(_ type: T.Type = T.self) async throws -> T {
        guard let row = try await maybeSingle(T.self) else { throw APIError.notFound }
        return row
    }

    func maybeSingle<T: Decodable>(_ type: T.Type = T.self) async throws -> T? {
        try await limit(1).execute(T.self).first
    }

    // MARK: Writing

    func insert(_ values: some Encodable, returning: Bool = false) async throws {
        var h = headers
        h["Prefer"] = returning ? "return=representation" : "return=minimal"
        try await client.send(path: "rest/v1/\(table)", method: "POST", query: query, headers: h, body: try JSONCoding.encoder.encode(values))
    }

    func insertReturning<T: Decodable>(_ values: some Encodable, as type: T.Type = T.self) async throws -> T {
        var h = headers
        h["Prefer"] = "return=representation"
        let data = try await client.send(path: "rest/v1/\(table)", method: "POST", query: adding("select", "*").query, headers: h, body: try JSONCoding.encoder.encode(values))
        guard let row = try client.decode([T].self, from: data).first else { throw APIError.invalidResponse }
        return row
    }

    func upsert(_ values: some Encodable, onConflict: String) async throws {
        var h = headers
        h["Prefer"] = "resolution=merge-duplicates,return=minimal"
        try await client.send(path: "rest/v1/\(table)", method: "POST", query: adding("on_conflict", onConflict).query, headers: h, body: try JSONCoding.encoder.encode(values))
    }

    /// PATCH rows matched by previously applied filters.
    func update(_ values: some Encodable) async throws {
        var h = headers
        h["Prefer"] = "return=minimal"
        try await client.send(path: "rest/v1/\(table)", method: "PATCH", query: query, headers: h, body: try JSONCoding.encoder.encode(values))
    }

    func delete() async throws {
        try await client.send(path: "rest/v1/\(table)", method: "DELETE", query: query)
    }

    private func adding(_ name: String, _ value: String) -> Self {
        var copy = self
        copy.query.append(URLQueryItem(name: name, value: value))
        return copy
    }
}

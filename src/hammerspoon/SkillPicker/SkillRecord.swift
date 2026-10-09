import Foundation
struct SkillSource: Codable, Equatable { let harness: String; let path: String }
struct SkillRecord: Codable, Equatable {
    let id: String
    let name: String
    let path: String
    let owner: String
    let harnesses: [String]
    let sources: [SkillSource]
    let ambiguous: Bool
    init(id: String = "", name: String, path: String, owner: String = "", harnesses: [String] = ["codex"], sources: [SkillSource] = [], ambiguous: Bool = false) {
        self.id = id.isEmpty ? path : id; self.name = name; self.path = path; self.owner = owner
        self.harnesses = harnesses; self.sources = sources; self.ambiguous = ambiguous
    }
    var title: String { owner.isEmpty ? name : name + " · " + owner }
    var wire: [String: Any] { ["id":id,"name":name,"path":path,"owner":owner,"harnesses":harnesses,"sources":sources.map { ["harness":$0.harness,"path":$0.path] },"ambiguous":ambiguous] }
    static func parse(_ value: Any?) -> [SkillRecord] {
        guard let value = value, let data = try? JSONSerialization.data(withJSONObject: value),
              let records = try? JSONDecoder().decode([SkillRecord].self, from: data) else { return [] }
        return records
    }
}

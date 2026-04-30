import ActivityKit
import Foundation

struct TimerActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var taskName: String
        var startDate: Date
        var isRunning: Bool
        var pausedElapsedSeconds: Double
        var pausedAt: Date?
        var pendingAction: String?
    }
}

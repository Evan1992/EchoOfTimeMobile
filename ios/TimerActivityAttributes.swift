import ActivityKit
import Foundation

struct TimerActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        // The task being timed (e.g. "Deep Work").
        var taskName: String
        // The effective start timestamp — Date.now() - elapsed at the moment
        // the timer was (re)started, so iOS can compute elapsed time natively.
        var startDate: Date
        var isRunning: Bool
    }
}

import ActivityKit
import Foundation

@objc(EchoTimerModule)
class EchoTimerModule: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc func startActivity(
        _ taskName: String,
        startDateMs: Double,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else { resolve(nil); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { resolve(nil); return }
        do {
            let startDate = Date(timeIntervalSince1970: startDateMs / 1000)
            let attributes = TimerActivityAttributes()
            let state = TimerActivityAttributes.ContentState(
                taskName: taskName,
                startDate: startDate,
                isRunning: true
            )
            let activity = try Activity<TimerActivityAttributes>.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil)
            )
            resolve(activity.id)
        } catch {
            reject("START_FAILED", error.localizedDescription, error)
        }
    }

    @objc func updateActivity(
        _ activityId: String,
        taskName: String,
        startDateMs: Double,
        isRunning: Bool,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else { resolve(nil); return }
        let startDate = Date(timeIntervalSince1970: startDateMs / 1000)
        let state = TimerActivityAttributes.ContentState(
            taskName: taskName,
            startDate: startDate,
            isRunning: isRunning
        )
        Task {
            for activity in Activity<TimerActivityAttributes>.activities
                where activity.id == activityId {
                await activity.update(.init(state: state, staleDate: nil))
            }
            resolve(nil)
        }
    }

    @objc func stopActivity(
        _ activityId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else { resolve(nil); return }
        Task {
            for activity in Activity<TimerActivityAttributes>.activities
                where activity.id == activityId {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            resolve(nil)
        }
    }
}

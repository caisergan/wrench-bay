import UIKit
import Capacitor

/// The app's bridge view controller: registers the app's own plugins once Capacitor has loaded.
class GameViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DevThermalPlugin())
    }
}

/// Heat and battery readings for the dev tool's Perf tab (src/dev/thermal.js), so device tests can compare settings
/// by the phone's own thermal state rather than by feel. Read-only; the game itself never calls it.
@objc(DevThermalPlugin)
public class DevThermalPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DevThermalPlugin"
    public let jsName = "DevThermal"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise)
    ]

    @objc func read(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let info = ProcessInfo.processInfo
            let device = UIDevice.current
            device.isBatteryMonitoringEnabled = true
            let thermal: String
            switch info.thermalState {
            case .nominal: thermal = "nominal"
            case .fair: thermal = "fair"
            case .serious: thermal = "serious"
            case .critical: thermal = "critical"
            @unknown default: thermal = "unknown"
            }
            let charging = device.batteryState == .charging || device.batteryState == .full
            call.resolve([
                "thermal": thermal,
                "lowPower": info.isLowPowerModeEnabled,
                "battery": device.batteryLevel,   // 0...1, -1 when unknown
                "charging": charging
            ])
        }
    }
}

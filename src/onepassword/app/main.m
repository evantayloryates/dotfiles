// A real, stable macOS app identity for TCC attribution of op subprocesses.
// No windows, vault operations, network access, or credential storage here.
#import <AppKit/AppKit.h>
#import <signal.h>

@interface BrokerDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSTask *worker;
@property(nonatomic, strong) dispatch_source_t termination;
@end

@implementation BrokerDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    self.worker = [[NSTask alloc] init];
    self.worker.executableURL = [NSURL fileURLWithPath:@"/usr/bin/python3"];
    NSString *script = [[NSBundle mainBundle] pathForResource:@"op_agent" ofType:@"py"];
    self.worker.arguments = @[@"-B", script, @"serve"];
    // Do not retain the global launchd credential environment in the broker.
    // Each client supplies its own environment only for the duration of a call.
    self.worker.environment = @{@"HOME": NSHomeDirectory(), @"USER": NSUserName(),
        @"PATH": @"/usr/bin:/bin:/usr/sbin:/sbin", @"LANG": @"en_US.UTF-8"};
    self.worker.standardInput = [NSFileHandle fileHandleWithNullDevice];
    self.worker.standardOutput = [NSFileHandle fileHandleWithNullDevice];
    self.worker.standardError = [NSFileHandle fileHandleWithNullDevice];
    self.worker.terminationHandler = ^(NSTask *task) {
        dispatch_async(dispatch_get_main_queue(), ^{ [NSApp terminate:nil]; });
    };
    NSError *error = nil;
    if (![self.worker launchAndReturnError:&error]) {
        // Never log a subprocess environment or command payload.
        NSLog(@"1Password CLI Broker could not start its worker.");
        [NSApp terminate:nil];
        return;
    }
    signal(SIGTERM, SIG_IGN);
    self.termination = dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL, SIGTERM, 0, dispatch_get_main_queue());
    dispatch_source_set_event_handler(self.termination, ^{ [NSApp terminate:nil]; });
    dispatch_resume(self.termination);
}
- (void)applicationWillTerminate:(NSNotification *)notification {
    if (self.worker.running) {
        [self.worker terminate];
        [self.worker waitUntilExit];
    }
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = [NSApplication sharedApplication];
        [application setActivationPolicy:NSApplicationActivationPolicyProhibited];
        BrokerDelegate *delegate = [[BrokerDelegate alloc] init];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}

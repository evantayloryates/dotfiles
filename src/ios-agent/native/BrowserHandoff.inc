// DEV-only handoff to the two installed browsers on this Mac's private web origins.
// Enrollment fragments remain private. No arbitrary scheme, host or application.
static NSURL *IABrowserHandoffURL;
static NSString *IABrowserHandoffCommand;
static NSString *IABrowserHandoffBrowser;
static NSDictionary *IABrowserHandoffReceipt;
static NSDictionary *IOSAgentBrowserState(void) { return IABrowserHandoffReceipt?:@{}; }
static NSDictionary *IOSAgentBrowserPrepare(NSDictionary *args, NSString *command, NSDictionary *config) {
 NSString *browser=args[@"browser"], *source=args[@"url"];
 if(args.count!=2 || ![browser isKindOfClass:NSString.class] || ![@[@"ios-safari",@"ios-chrome"] containsObject:browser] || ![source isKindOfClass:NSString.class] || source.length>4096) return IAError(@"fixed_dev_browser_required");
 NSURLComponents *url=[NSURLComponents componentsWithString:source];
 NSURLComponents *endpoint=[NSURLComponents componentsWithString:config[@"endpoint"]];
 BOOL valid=[url.scheme isEqual:@"https"] && [url.host isEqual:endpoint.host] && [url.host hasSuffix:@".ts.net"] &&
  !url.user && !url.password && !url.query && [@[@10446,@10520] containsObject:url.port] &&
  [url.path hasPrefix:@"/dev/"] && ![url.path containsString:@".."] && ![source containsString:@"\\"] &&
  [url.fragment hasPrefix:@"ios-agent="] && url.fragment.length>10 && url.fragment.length<2048;
 if(!valid) return IAError(@"fixed_private_dev_browser_URL_required");
 // The custom Chrome scheme prompts at the OS layer and makes DEV inactive.
 // Normal HTTPS avoids that app-switch confirmation when Chrome is already
 // the user's default browser. The host must still verify the actual browser;
 // this never changes the personal default or claims a targeted launch.
 url.scheme=[browser isEqual:@"ios-safari"]?@"x-safari-https":@"https";
 IABrowserHandoffURL=url.URL; IABrowserHandoffCommand=command; IABrowserHandoffBrowser=browser;
 NSString *mode=[browser isEqual:@"ios-safari"]?@"safari-direct":@"system-default-https";
 IABrowserHandoffReceipt=@{@"browser":browser,@"mode":mode,@"outcome":@"prepared",@"foregroundVerified":@NO};
 return @{@"delivery":@"prepared-browser-handoff",@"browser":browser,@"mode":mode,@"requiresFreshLease":@YES,@"foregroundVerified":@NO};
}
static void IOSAgentBrowserLaunch(NSString *command) {
 if(!IABrowserHandoffURL || ![IABrowserHandoffCommand isEqual:command])return;
 NSURL *url=IABrowserHandoffURL; NSString *browser=IABrowserHandoffBrowser;
 IABrowserHandoffURL=nil; IABrowserHandoffCommand=nil; IABrowserHandoffBrowser=nil;
 NSTimeInterval started=NSProcessInfo.processInfo.systemUptime;
 [UIApplication.sharedApplication openURL:url options:@{} completionHandler:^(BOOL opened){
  IABrowserHandoffReceipt=@{@"browser":browser,@"mode":[browser isEqual:@"ios-safari"]?@"safari-direct":@"system-default-https",
   @"outcome":opened?@"system-accepted":@"system-rejected",@"elapsedMs":@((NSProcessInfo.processInfo.systemUptime-started)*1000),@"foregroundVerified":@NO};
 }];
}

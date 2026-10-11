// DEV-only handoff to the two installed browsers on this Mac's private web origins.
// Enrollment fragments remain private. No arbitrary scheme, host or application.
static NSURL *IABrowserHandoffURL;
static NSString *IABrowserHandoffCommand;
static NSString *IABrowserHandoffBrowser;
static NSString *IABrowserHandoffMode;
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
 // A phone-local, explicitly provisioned Shortcut has already opened a fresh
 // Chrome page after its one-time permissions. Qualify this app-owned hop
 // separately; an accepted openURL still grants no browser-readiness proof.
 BOOL safari=[browser isEqual:@"ios-safari"];
 url.scheme=safari?@"x-safari-https":@"googlechromes";
 NSURL *destination=url.URL;
 if(!safari) {
  NSURLComponents *shortcut=[NSURLComponents componentsWithString:@"shortcuts://run-shortcut"];
  shortcut.queryItems=@[[NSURLQueryItem queryItemWithName:@"name" value:@"Runner Open Chrome DEV"],
   [NSURLQueryItem queryItemWithName:@"input" value:@"text"],
   [NSURLQueryItem queryItemWithName:@"text" value:url.string]];
  destination=shortcut.URL;
 }
 IABrowserHandoffURL=destination; IABrowserHandoffCommand=command; IABrowserHandoffBrowser=browser;
 NSString *mode=safari?@"safari-direct":@"phone-local-chrome-shortcut";
 IABrowserHandoffMode=mode;
 IABrowserHandoffReceipt=@{@"browser":browser,@"mode":mode,@"outcome":@"prepared",@"foregroundVerified":@NO};
 return @{@"delivery":@"prepared-browser-handoff",@"browser":browser,@"mode":mode,@"requiresFreshLease":@YES,@"foregroundVerified":@NO};
}
static void IOSAgentBrowserLaunch(NSString *command) {
 if(!IABrowserHandoffURL || ![IABrowserHandoffCommand isEqual:command])return;
 NSURL *url=IABrowserHandoffURL; NSString *browser=IABrowserHandoffBrowser; NSString *mode=IABrowserHandoffMode;
 IABrowserHandoffURL=nil; IABrowserHandoffCommand=nil; IABrowserHandoffBrowser=nil; IABrowserHandoffMode=nil;
 NSTimeInterval started=NSProcessInfo.processInfo.systemUptime;
 [UIApplication.sharedApplication openURL:url options:@{} completionHandler:^(BOOL opened){
  IABrowserHandoffReceipt=@{@"browser":browser,@"mode":mode,
   @"outcome":opened?@"system-accepted":@"system-rejected",@"elapsedMs":@((NSProcessInfo.processInfo.systemUptime-started)*1000),@"foregroundVerified":@NO};
 }];
}

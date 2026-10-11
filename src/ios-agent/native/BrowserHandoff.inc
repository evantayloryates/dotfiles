// DEV-only handoff to the two installed browsers on this Mac's private web origins.
// Enrollment fragments remain private. No arbitrary scheme, host or application.
static NSURL *IABrowserHandoffURL;
static NSString *IABrowserHandoffCommand;
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
 url.scheme=[browser isEqual:@"ios-safari"]?@"x-safari-https":@"googlechromes";
 IABrowserHandoffURL=url.URL; IABrowserHandoffCommand=command;
 return @{@"delivery":@"prepared-browser-handoff",@"browser":browser,@"requiresFreshLease":@YES,@"foregroundVerified":@NO};
}
static void IOSAgentBrowserLaunch(NSString *command) {
 if(!IABrowserHandoffURL || ![IABrowserHandoffCommand isEqual:command])return;
 NSURL *url=IABrowserHandoffURL; IABrowserHandoffURL=nil; IABrowserHandoffCommand=nil;
 [UIApplication.sharedApplication openURL:url options:@{} completionHandler:^(BOOL opened){}];
}

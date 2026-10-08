// Fixed, app-owned handoff to Apple's Shortcuts. No arbitrary URLs or scripts.
// Included only by the opt-in Debug agent. A callback is not radio-state proof.
#import <ifaddrs.h>
#import <net/if.h>
#import <netinet/in.h>
static NSMutableDictionary *IAWiFi;
static NSTimeInterval IAWiFiExpires;
static NSString *IAWiFiNonce;
static NSURL *IAWiFiURL;

static NSDictionary *IOSAgentWiFiState(void) {
 if(IAWiFiNonce && IANow()>IAWiFiExpires) {
  IAWiFi[@"status"]=@"expired"; IAWiFiNonce=nil; IAWiFiURL=nil;
 }
 BOOL present=NO, up=NO, running=NO, ipv4=NO;
 struct ifaddrs *interfaces=NULL;
 BOOL read=getifaddrs(&interfaces)==0;
 if(read) {
  for(struct ifaddrs *item=interfaces;item;item=item->ifa_next) {
   if(!item->ifa_name || strcmp(item->ifa_name,"en0")) continue;
   present=YES; up|=(item->ifa_flags&IFF_UP)!=0; running|=(item->ifa_flags&IFF_RUNNING)!=0;
   if(item->ifa_addr && item->ifa_addr->sa_family==AF_INET) ipv4=YES;
  }
  freeifaddrs(interfaces);
 }
 NSMutableDictionary *state=[(IAWiFi?@{@"requested":IAWiFi[@"requested"],@"status":IAWiFi[@"status"]}:@{@"status":@"idle"}) mutableCopy];
 state[@"radioVerified"]=@NO;
 // An interface observation supports connection checks; it does not assert a radio switch.
 // No address, SSID, BSSID or arbitrary interface data leaves the app.
 state[@"wifiInterface"]=@{@"readable":@(read),@"present":@(present),@"up":@(up),@"running":@(running),@"ipv4Present":@(ipv4)};
 return state;
}
static NSDictionary *IOSAgentWiFiPrepare(NSDictionary *args, NSString *command) {
 IOSAgentWiFiState();
 NSString *state=args[@"state"];
 if(args.count!=1 || ![state isKindOfClass:NSString.class] || ![@[@"on",@"off"] containsObject:state]) return IAError(@"wifi_state_on_or_off_required");
 if(IAWiFiNonce) return IAError(@"wifi_handoff_pending");
 IAWiFiNonce=NSUUID.UUID.UUIDString; IAWiFiExpires=IANow()+60;
 IAWiFi=[@{@"requested":state,@"status":@"prepared",@"command":command} mutableCopy];
 NSMutableArray *query=[NSMutableArray arrayWithObject:[NSURLQueryItem queryItemWithName:@"name" value:[state isEqual:@"on"]?@"Runner Wi-Fi On":@"Runner Wi-Fi Off"]];
 for(NSString *outcome in @[@"success",@"error",@"cancel"]) {
  NSURLComponents *callback=[NSURLComponents componentsWithString:@"kudos://ios-agent-return"];
  callback.queryItems=@[[NSURLQueryItem queryItemWithName:@"nonce" value:IAWiFiNonce],[NSURLQueryItem queryItemWithName:@"outcome" value:outcome]];
  [query addObject:[NSURLQueryItem queryItemWithName:[@"x-" stringByAppendingString:outcome] value:callback.string]];
 }
 NSURLComponents *url=[NSURLComponents componentsWithString:@"shortcuts://x-callback-url/run-shortcut"];
 url.queryItems=query; IAWiFiURL=url.URL;
 return @{@"delivery":@"prepared-shortcut-handoff",@"requested":state,@"radioVerified":@NO,@"requiresFreshLease":@YES};
}
static void IOSAgentWiFiLaunch(NSString *command) {
 IOSAgentWiFiState();
 if(!IAWiFiURL || ![IAWiFi[@"command"] isEqual:command] || ![IAWiFi[@"status"] isEqual:@"prepared"]) return;
 NSString *nonce=IAWiFiNonce;
 IAWiFi[@"status"]=@"opening";
 [UIApplication.sharedApplication openURL:IAWiFiURL options:@{} completionHandler:^(BOOL opened){
  if(![IAWiFiNonce isEqual:nonce] || ![IAWiFi[@"status"] isEqual:@"opening"]) return;
  IAWiFi[@"status"]=opened?@"opened":@"failed";
  if(!opened) { IAWiFiNonce=nil; IAWiFiURL=nil; }
 }];
}
static BOOL IOSAgentHandleURL(NSURL *url) {
 if(![url.scheme isEqual:@"kudos"] || ![url.host isEqual:@"ios-agent-return"]) return NO;
 // Consume this reserved dev URL even if malformed; never route it to business navigation.
 IOSAgentWiFiState();
 if(!IAWiFiNonce || url.path.length || url.user || url.password || url.fragment || url.port) return YES;
 NSURLComponents *components=[NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
 NSMutableDictionary *query=[NSMutableDictionary new];
 for(NSURLQueryItem *item in components.queryItems) {
  if(!item.value || query[item.name]) return YES;
  // Shortcuts may add diagnostic fields; do not retain or export those contents.
  query[item.name]=item.value;
 }
 NSString *outcome=query[@"outcome"];
 if(![query[@"nonce"] isEqual:IAWiFiNonce] || ![@[@"success",@"error",@"cancel"] containsObject:outcome]) return YES;
 IAWiFi[@"status"]=[outcome isEqual:@"success"]?@"returned":([outcome isEqual:@"cancel"]?@"cancelled":@"failed");
 IAWiFiNonce=nil; IAWiFiURL=nil;
 return YES;
}

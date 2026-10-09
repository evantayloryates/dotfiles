// Synthetic UIKit fixture. Simulator test only; no network or business data.
#define DEBUG 1
#define IOS_AGENT_ENABLED 1
#import "../native/IOSAgent.inc"

@interface TouchProbe : UIView
@property NSInteger cancelled;
@property NSInteger ended;
@end
@implementation TouchProbe
- (void)touchesCancelled:(NSSet<UITouch*>*)touches withEvent:(UIEvent*)event { self.cancelled++; [super touchesCancelled:touches withEvent:event]; }
- (void)touchesEnded:(NSSet<UITouch*>*)touches withEvent:(UIEvent*)event { self.ended++; [super touchesEnded:touches withEvent:event]; }
@end

@interface Fixture : UIResponder<UIApplicationDelegate>
@property UIWindow *window;
@property UIButton *button;
@property UITextField *field;
@property UIScrollView *scroll;
@property TouchProbe *hold;
@property NSInteger childTaps;
@property NSInteger parentTaps;
@property NSInteger pans;
@property NSInteger competingHolds;
@property NSInteger taps;
@property NSInteger holds;
@property NSMutableDictionary *evidence;
@end
@implementation Fixture
- (void)tapped { self.taps++; }
- (void)childTapped:(UITapGestureRecognizer*)r { if(r.state==UIGestureRecognizerStateRecognized)self.childTaps++; }
- (void)parentTapped:(UITapGestureRecognizer*)r { if(r.state==UIGestureRecognizerStateRecognized)self.parentTaps++; }
- (void)panned:(UIPanGestureRecognizer*)r { if(r.state==UIGestureRecognizerStateBegan)self.pans++; }
- (void)competingHeld:(UILongPressGestureRecognizer*)r { if(r.state==UIGestureRecognizerStateBegan)self.competingHolds++; }
- (void)after:(double)seconds done:(void(^)(void))done { dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(seconds*NSEC_PER_SEC)),dispatch_get_main_queue(),done); }
- (void)freshLease { IAInstance.lease=@"fixture-lease"; IAInstance.expiry=IANow()+60; }
- (void)extended:(void(^)(void))done {
 [self freshLease];
 NSDictionary *point=[self pointArgs:self.hold]; CGRect frame=self.hold.frame;
 self.hold.frame=CGRectOffset(frame,10,0);
 [self run:@"tap" args:point done:^(NSDictionary *r){self.evidence[@"geometryRejection"]=r;}]; self.hold.frame=frame;
 point=[self pointArgs:self.button]; [self run:@"tree" args:@{} done:^(NSDictionary *r){}];
 [self run:@"tap" args:point done:^(NSDictionary *r){self.evidence[@"supersededSnapshotRejection"]=r;}];
 point=[self pointArgs:self.hold]; [self.hold removeFromSuperview];
 [self run:@"tap" args:point done:^(NSDictionary *r){self.evidence[@"removedTargetRejection"]=r;}]; [self.window.rootViewController.view addSubview:self.hold];
 NSMutableDictionary *outside=[[self pointArgs:self.button] mutableCopy]; outside[@"x"]=@(-1);
 [self run:@"tap" args:outside done:^(NSDictionary *r){self.evidence[@"outsideAppRejection"]=r;}];
 NSDictionary *duplicate=@{@"id":@"fixture-duplicate",@"action":@"tree",@"args":@{},@"lease":IAInstance.lease,@"epoch":IAInstance.epoch,@"remainingMs":@10000};
 [IAInstance execute:duplicate completion:^(NSDictionary *r){}];
 [IAInstance execute:duplicate completion:^(NSDictionary *r){self.evidence[@"duplicateRejection"]=r;}];
 [IAInstance execute:@{@"id":@"wrong-epoch",@"action":@"tree",@"args":@{},@"lease":IAInstance.lease,@"epoch":@"retired-epoch",@"remainingMs":@10000} completion:^(NSDictionary *r){self.evidence[@"epochRejection"]=r;}];
 [self run:@"text" args:@{@"text":@"Should not insert"} done:^(NSDictionary *r){self.evidence[@"unfocusedTextRejection"]=r;}];
 // A different app-owned window is an occlusion even in a legacy AppDelegate app.
 NSDictionary *windowPoint=[self pointArgs:self.hold]; NSInteger endedBefore=self.hold.ended;
 UIWindow *cover=[[UIWindow alloc] initWithFrame:self.window.bounds]; cover.windowLevel=UIWindowLevelNormal+20;
 UIViewController *coverRoot=[UIViewController new]; coverRoot.view.backgroundColor=UIColor.systemRedColor; cover.rootViewController=coverRoot; cover.hidden=NO;
 [self run:@"tap" args:windowPoint done:^(NSDictionary *r){
  self.evidence[@"secondaryWindowRejection"]=r;
  self.evidence[@"secondaryWindowNoUnderlyingTouch"]=@(self.hold.ended==endedBefore);
  cover.hidden=YES;
  [self modalMatrix:done];
 }];
}
- (void)modalMatrix:(void(^)(void))done {
 // An actual UIKit modal must block an otherwise fresh main-window target.
 NSDictionary *modalPoint=[self pointArgs:self.hold];
 UIViewController *modal=[UIViewController new]; modal.view.backgroundColor=UIColor.systemYellowColor; modal.modalPresentationStyle=UIModalPresentationOverFullScreen;
 [self.window.rootViewController presentViewController:modal animated:NO completion:^{
  [self run:@"tap" args:modalPoint done:^(NSDictionary *r){self.evidence[@"modalRejection"]=r;}];
  [modal dismissViewControllerAnimated:NO completion:^{[self recognizerMatrix:done];}];
 }];
}
- (void)recognizerMatrix:(void(^)(void))done {
 [self freshLease];
 UIView *panel=[[UIView alloc] initWithFrame:CGRectMake(0,80,350,550)]; panel.backgroundColor=UIColor.whiteColor; [self.window.rootViewController.view addSubview:panel];
 UIView *parent=[[UIView alloc] initWithFrame:CGRectMake(20,20,300,130)]; parent.accessibilityIdentifier=@"fixture-parent-gesture"; [panel addSubview:parent];
 UIView *child=[[UIView alloc] initWithFrame:CGRectMake(30,20,220,90)]; child.accessibilityIdentifier=@"fixture-child-gesture"; [parent addSubview:child];
 UITapGestureRecognizer *childTap=[[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(childTapped:)]; [child addGestureRecognizer:childTap];
 UITapGestureRecognizer *parentTap=[[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(parentTapped:)]; [parentTap requireGestureRecognizerToFail:childTap]; [parent addGestureRecognizer:parentTap];
 UIView *competition=[[UIView alloc] initWithFrame:CGRectMake(20,170,300,120)]; competition.accessibilityIdentifier=@"fixture-competing-gesture"; [panel addSubview:competition];
 UIPanGestureRecognizer *pan=[[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(panned:)]; [competition addGestureRecognizer:pan];
 UILongPressGestureRecognizer *hold=[[UILongPressGestureRecognizer alloc] initWithTarget:self action:@selector(competingHeld:)]; hold.minimumPressDuration=0.5; [competition addGestureRecognizer:hold];
 UITextField *first=[[UITextField alloc] initWithFrame:CGRectMake(20,320,300,45)]; first.accessibilityIdentifier=@"fixture-focus-one"; first.borderStyle=UITextBorderStyleRoundedRect; [panel addSubview:first];
 UITextField *second=[[UITextField alloc] initWithFrame:CGRectMake(20,375,300,45)]; second.accessibilityIdentifier=@"fixture-focus-two"; second.borderStyle=UITextBorderStyleRoundedRect; [panel addSubview:second];
 [self run:@"tap" args:[self pointArgs:child] done:^(NSDictionary *r){
  self.evidence[@"nestedTapDelivery"]=r;
  [self after:0.15 done:^{
   self.evidence[@"nestedRecognizerPrecedence"]=@(self.childTaps==1&&self.parentTaps==0);
   NSMutableDictionary *drag=[[self pointArgs:competition] mutableCopy]; drag[@"endX"]=@50; drag[@"endY"]=drag[@"y"]; drag[@"durationMs"]=@350;
   [self run:@"gesture" args:drag done:^(NSDictionary *r){
    self.evidence[@"competingPanDelivery"]=r;
    self.evidence[@"panDefeatsLongPress"]=@(self.pans==1&&self.competingHolds==0);
    [self run:@"tap" args:[self pointArgs:first] done:^(NSDictionary *r){
     self.evidence[@"nativeTapFocus"]=@(first.isFirstResponder);
     [self run:@"text" args:@{@"text":@"A🐾"} done:^(NSDictionary *typed){}];
     // Focus selection is native tap; UIKeyInput only edits the actual responder.
     [self run:@"tap" args:[self pointArgs:second] done:^(NSDictionary *r){
      [self run:@"text" args:@{@"text":@"Bé"} done:^(NSDictionary *typed){}];
      self.evidence[@"focusSwitchAndUnicode"]=@(second.isFirstResponder&&[first.text isEqual:@"A🐾"]&&[second.text isEqual:@"Bé"]);
      [second resignFirstResponder]; [panel removeFromSuperview];
      [self after:0.35 done:done];
     }];
    }];
   }];
  }];
 }];
}
- (void)held:(UILongPressGestureRecognizer*)r { if(r.state==UIGestureRecognizerStateBegan)self.holds++; }
- (void)write {
 NSString *docs=NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject;
 NSData *data=[NSJSONSerialization dataWithJSONObject:self.evidence options:NSJSONWritingPrettyPrinted error:nil];
 [data writeToFile:[docs stringByAppendingPathComponent:@"evidence.json"] atomically:YES];
}
- (void)run:(NSString*)action args:(NSDictionary*)args done:(void(^)(NSDictionary*))done {
 [IAInstance execute:@{@"id":NSUUID.UUID.UUIDString,@"action":action,@"args":args,@"lease":IAInstance.lease?:@"expired",@"epoch":IAInstance.epoch,@"remainingMs":@10000} completion:done];
}
- (NSDictionary*)pointArgs:(UIView*)view {
 __block NSDictionary *tree; [self run:@"tree" args:@{} done:^(NSDictionary *value){tree=value;}];
 NSString *node=nil; for(NSDictionary *item in tree[@"nodes"])if([item[@"identifier"] isEqual:view.accessibilityIdentifier])node=item[@"node"];
 CGPoint point=[view convertPoint:CGPointMake(view.bounds.size.width/2,view.bounds.size.height/2) toView:self.window];
 return @{@"snapshot":tree[@"snapshot"],@"target":node?:@"missing",@"x":@(point.x),@"y":@(point.y)};
}
- (BOOL)application:(UIApplication*)app didFinishLaunchingWithOptions:(NSDictionary*)options {
 self.evidence=[NSMutableDictionary new]; self.window=[[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
 UIViewController *root=[UIViewController new]; root.view.backgroundColor=UIColor.whiteColor; self.window.rootViewController=root;
 self.scroll=[[UIScrollView alloc] initWithFrame:CGRectMake(20,100,300,350)]; self.scroll.contentSize=CGSizeMake(300,1400); self.scroll.accessibilityIdentifier=@"fixture-scroll"; [root.view addSubview:self.scroll];
 self.button=[UIButton buttonWithType:UIButtonTypeSystem]; self.button.frame=CGRectMake(30,20,180,80); self.button.accessibilityIdentifier=@"fixture-button"; [self.button setTitle:@"Native touch counter" forState:UIControlStateNormal]; [self.button addTarget:self action:@selector(tapped) forControlEvents:UIControlEventTouchUpInside]; [self.scroll addSubview:self.button];
 self.hold=[[TouchProbe alloc] initWithFrame:CGRectMake(20,500,300,90)]; self.hold.backgroundColor=UIColor.systemBlueColor; self.hold.accessibilityIdentifier=@"fixture-hold"; [root.view addSubview:self.hold];
 [self.hold addGestureRecognizer:[[UILongPressGestureRecognizer alloc] initWithTarget:self action:@selector(held:)]];
 self.field=[[UITextField alloc] initWithFrame:CGRectMake(20,650,300,50)]; self.field.borderStyle=UITextBorderStyleRoundedRect; self.field.accessibilityIdentifier=@"fixture-text"; [root.view addSubview:self.field];
 [self.window makeKeyAndVisible];
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC),dispatch_get_main_queue(),^{[self qualify];}); return YES;
}
- (void)qualify {
 IAInstance=[IOSAgent new]; IAInstance.lease=@"fixture-lease"; IAInstance.epoch=@"fixture-epoch"; IAInstance.expiry=IANow()+60; IAInstance.seen=[NSMutableArray new]; IAInstance.reactFrames=[NSMutableArray new];
 NSDictionary *prepared=IOSAgentWiFiPrepare(@{@"state":@"off"},@"wifi-fixture");
 NSURLComponents *handoff=[NSURLComponents componentsWithURL:IAWiFiURL resolvingAgainstBaseURL:NO];
 NSString *callback=nil, *shortcut=nil;
 for(NSURLQueryItem *item in handoff.queryItems) {
  if([item.name isEqual:@"x-success"]) callback=item.value;
  if([item.name isEqual:@"name"]) shortcut=item.value;
 }
 BOOL fence=[prepared[@"delivery"] isEqual:@"prepared-shortcut-handoff"] && [shortcut isEqual:@"Runner Wi-Fi Off"];
 NSString *nonce=IAWiFiNonce;
 fence&=IOSAgentWiFiPrepare(@{@"state":@"on"},@"overlap")[@"error"]!=nil;
 fence&=!IOSAgentHandleURL([NSURL URLWithString:@"kudos://ordinary-business-route"]);
 fence&=IOSAgentHandleURL([NSURL URLWithString:@"kudos://ios-agent-return?nonce=wrong&outcome=success"]) && [IAWiFiNonce isEqual:nonce];
 fence&=IOSAgentHandleURL([NSURL URLWithString:[callback stringByAppendingString:@"&nonce=duplicate"]]) && [IAWiFiNonce isEqual:nonce];
 fence&=IOSAgentHandleURL([NSURL URLWithString:callback]) && !IAWiFiNonce && [IOSAgentWiFiState()[@"status"] isEqual:@"returned"];
 fence&=[IAInstance.lease isEqual:@"fixture-lease"] && ![IOSAgentWiFiState()[@"radioVerified"] boolValue];
 fence&=IOSAgentWiFiPrepare(@{@"state":@"on",@"url":@"https://example.com"},@"invalid")[@"error"]!=nil;
 IOSAgentWiFiPrepare(@{@"state":@"on"},@"expire"); IAWiFiExpires=IANow()-1;
 fence&=[IOSAgentWiFiState()[@"status"] isEqual:@"expired"] && !IAWiFiNonce && !IAWiFiURL;
 self.evidence[@"wifiCallbackFencing"]=@(fence);
 IAWiFi=nil;
 [IAInstance startWatchdog];
 [self run:@"capabilities" args:@{} done:^(NSDictionary *r){self.evidence[@"capabilities"]=r;}];
 [self captureMatrix:^{[self qualifyInput];}];
}
- (void)captureMatrix:(void(^)(void))done {
 [IAInstance showGlow];
 [self run:@"image" args:@{@"scale":@4} done:^(NSDictionary *r){self.evidence[@"invalidCaptureScale"]=r;}];
 [self run:@"image" args:@{@"scale":@1} done:^(NSDictionary *r){
  NSData *png=[[NSData alloc] initWithBase64EncodedString:r[@"pngBase64"] options:0];
  UIImage *image=[UIImage imageWithData:png];
  self.evidence[@"capturePointResolution"]=@(image && CGImageGetWidth(image.CGImage)==(NSUInteger)self.window.bounds.size.width && [r[@"pngBytes"] unsignedIntegerValue]==png.length && [r[@"glowIncluded"] isEqual:@NO]);
  [self run:@"image" args:@{} done:^(NSDictionary *r){
   UIImage *image=[UIImage imageWithData:[[NSData alloc] initWithBase64EncodedString:r[@"pngBase64"] options:0]];
   self.evidence[@"captureDefaultResolution"]=@(image && [r[@"scale"] isEqual:@2] && CGImageGetWidth(image.CGImage)==(NSUInteger)(self.window.bounds.size.width*2));
   [self run:@"image" args:@{@"scale":@1} done:^(NSDictionary *r){
    self.evidence[@"captureLeaseFencing"]=@([r[@"error"] isEqual:@"capture_lease_expired"] && [IAInstance.lease isEqual:@"new-capture-owner"] && !IAInstance.glow.hidden);
    [self freshLease]; done();
   }];
   // Encoding is asynchronous. Retire its owner before the main-thread callback.
   [IAInstance stopLease]; IAInstance.lease=@"new-capture-owner"; IAInstance.expiry=IANow()+60; [IAInstance showGlow];
  }];
 }];
}
- (void)qualifyInput {
 [IAInstance showGlow]; CGRect before=self.button.frame; BOOL keyBefore=self.window.isKeyWindow;
 NSDictionary *point=[self pointArgs:self.button];
 [self run:@"tap" args:point done:^(NSDictionary *r){
  self.evidence[@"tapDelivery"]=r; self.evidence[@"tapCount"]=@(self.taps);
  self.evidence[@"glowPreservesLayoutAndKey"]=@(CGRectEqualToRect(before,self.button.frame)&&keyBefore&&self.window.isKeyWindow&&[IAInstance.glow hitTest:CGPointMake(20,20) withEvent:nil]==nil);
  UIView *cover=[[UIView alloc] initWithFrame:[self.button convertRect:self.button.bounds toView:self.window.rootViewController.view]]; cover.backgroundColor=UIColor.blackColor; [self.window.rootViewController.view addSubview:cover];
  [self run:@"tap" args:point done:^(NSDictionary *blocked){self.evidence[@"occlusionRejection"]=blocked;}]; [cover removeFromSuperview];
  IAInstance.snapshotAt-=6;
  [self run:@"tap" args:point done:^(NSDictionary *stale){self.evidence[@"staleSnapshotRejection"]=stale;}];
  IAInstance.lease=@"fixture-lease"; IAInstance.expiry=IANow()+60;
  NSMutableDictionary *hold=[[self pointArgs:self.hold] mutableCopy]; hold[@"endX"]=hold[@"x"]; hold[@"endY"]=hold[@"y"]; hold[@"durationMs"]=@750;
  [self run:@"gesture" args:hold done:^(NSDictionary *held){
   self.evidence[@"holdDelivery"]=held; self.evidence[@"holdCount"]=@(self.holds);
   IAInstance.lease=@"fixture-lease"; IAInstance.expiry=IANow()+60;
   NSMutableDictionary *scroll=[[self pointArgs:self.scroll] mutableCopy]; scroll[@"endX"]=scroll[@"x"]; scroll[@"endY"]=@140; scroll[@"durationMs"]=@350;
   [self run:@"gesture" args:scroll done:^(NSDictionary *scrolled){
    self.evidence[@"scrollDelivery"]=scrolled;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,500*NSEC_PER_MSEC),dispatch_get_main_queue(),^{
     self.evidence[@"scrollOffsetY"]=@(self.scroll.contentOffset.y);
     IAInstance.lease=@"fixture-lease"; IAInstance.expiry=IANow()+60;
     [self.field becomeFirstResponder]; [self run:@"text" args:@{@"text":@"Synthetic QA"} done:^(NSDictionary *typed){self.evidence[@"textDelivery"]=typed;self.evidence[@"textMatches"]=@([self.field.text isEqual:@"Synthetic QA"]);}];
     [self.field resignFirstResponder];
     [self extended:^{
     NSMutableDictionary *pending=[[self pointArgs:self.hold] mutableCopy]; pending[@"endX"]=pending[@"x"]; pending[@"endY"]=pending[@"y"]; pending[@"durationMs"]=@1200;
     NSInteger endedBefore=self.hold.ended;
     [self run:@"gesture" args:pending done:^(NSDictionary *oldResult){self.evidence[@"cancelledOldGesture"]=oldResult;}];
     [self run:@"tap" args:pending done:^(NSDictionary *r){self.evidence[@"inFlightRejection"]=r;}];
     dispatch_after(dispatch_time(DISPATCH_TIME_NOW,100*NSEC_PER_MSEC),dispatch_get_main_queue(),^{
      [IAInstance stopLease]; IAInstance.lease=@"new-owner"; IAInstance.expiry=IANow()+60; [IAInstance showGlow];
     });
     dispatch_after(dispatch_time(DISPATCH_TIME_NOW,1500*NSEC_PER_MSEC),dispatch_get_main_queue(),^{
      self.evidence[@"cancelledTouchObserved"]=@(self.hold.cancelled>=1&&self.hold.ended==endedBefore&&self.holds==1);
      self.evidence[@"oldCallbackPreservesNewOwner"]=@([IAInstance.lease isEqual:@"new-owner"]&&!IAInstance.glow.hidden);
      IAInstance.expiry=IANow()+0.1;
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW,400*NSEC_PER_MSEC),dispatch_get_main_queue(),^{
       self.evidence[@"independentNativeExpiry"]=@(!IAInstance.lease&&IAInstance.glow.hidden);
       self.evidence[@"cleanup"]=@(!IAInstance.lease&&IAInstance.glow.hidden&&!IAInstance.touch);
       self.evidence[@"xctestStarted"]=@NO; [self write];
      });
     });
     }];
    });
   }];
  }];
 }];
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(Fixture.class));}}

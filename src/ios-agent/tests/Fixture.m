// Synthetic UIKit fixture. Simulator test only; no network or business data.
#define DEBUG 1
#define IOS_AGENT_ENABLED 1
#import "../native/IOSAgent.inc"

@interface Fixture : UIResponder<UIApplicationDelegate>
@property UIWindow *window;
@property UIButton *button;
@property UITextField *field;
@property UIScrollView *scroll;
@property UIView *hold;
@property NSInteger taps;
@property NSInteger holds;
@property NSMutableDictionary *evidence;
@end
@implementation Fixture
- (void)tapped { self.taps++; }
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
 self.hold=[[UIView alloc] initWithFrame:CGRectMake(20,500,300,90)]; self.hold.backgroundColor=UIColor.systemBlueColor; self.hold.accessibilityIdentifier=@"fixture-hold"; [root.view addSubview:self.hold];
 [self.hold addGestureRecognizer:[[UILongPressGestureRecognizer alloc] initWithTarget:self action:@selector(held:)]];
 self.field=[[UITextField alloc] initWithFrame:CGRectMake(20,650,300,50)]; self.field.borderStyle=UITextBorderStyleRoundedRect; self.field.accessibilityIdentifier=@"fixture-text"; [root.view addSubview:self.field];
 [self.window makeKeyAndVisible];
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC),dispatch_get_main_queue(),^{[self qualify];}); return YES;
}
- (void)qualify {
 IAInstance=[IOSAgent new]; IAInstance.lease=@"fixture-lease"; IAInstance.epoch=@"fixture-epoch"; IAInstance.expiry=IANow()+60; IAInstance.seen=[NSMutableArray new]; IAInstance.reactFrames=[NSMutableArray new];
 [self run:@"capabilities" args:@{} done:^(NSDictionary *r){self.evidence[@"capabilities"]=r;}];
 [IAInstance showGlow]; CGRect before=self.button.frame; BOOL keyBefore=self.window.isKeyWindow;
 NSDictionary *point=[self pointArgs:self.button];
 [self run:@"tap" args:point done:^(NSDictionary *r){
  self.evidence[@"tapDelivery"]=r; self.evidence[@"tapCount"]=@(self.taps);
  self.evidence[@"glowPreservesLayoutAndKey"]=@(CGRectEqualToRect(before,self.button.frame)&&keyBefore&&self.window.isKeyWindow&&[IAInstance.glow hitTest:CGPointMake(20,20) withEvent:nil]==nil);
  UIView *cover=[[UIView alloc] initWithFrame:[self.button convertRect:self.button.bounds toView:self.window.rootViewController.view]]; cover.backgroundColor=UIColor.blackColor; [self.window.rootViewController.view addSubview:cover];
  [self run:@"tap" args:point done:^(NSDictionary *blocked){self.evidence[@"occlusionRejection"]=blocked;}]; [cover removeFromSuperview];
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
     [self.field resignFirstResponder]; [IAInstance stopLease];
     self.evidence[@"cleanup"]=@(!IAInstance.lease&&IAInstance.glow.hidden&&!IAInstance.touch);
     self.evidence[@"xctestStarted"]=@NO; [self write];
    });
   }];
  }];
 }];
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(Fixture.class));}}

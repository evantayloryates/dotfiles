// A single automatic fallback per explicit remote load. No retry loop.
static BOOL IAStartupShouldFallback(NSString *source, NSTimeInterval elapsed,
                                   BOOL registered, BOOL active, BOOL attempted) {
 return [source isEqual:@"tailnet-Metro"] && isfinite(elapsed) && elapsed>=45
        && !registered && active && !attempted;
}

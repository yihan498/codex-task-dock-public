use super::*;
#[test] fn bottom_right_respects_work_area_and_dpi() {
 assert_eq!(bottom_right((0,0),(1920,1040),(390,560),1.0),(1518,468));
 assert_eq!(bottom_right((0,0),(2880,1560),(585,840),1.5),(2277,702));
 assert_eq!(bottom_right((-1920,40),(1920,1000),(390,560),1.0),(-402,468));
}
#[test] fn oversized_window_and_invalid_scale_stay_at_safe_origin() {
 assert_eq!(bottom_right((20,30),(300,200),(390,560),2.0),(20,30));
 assert_eq!(bottom_right((0,0),(1920,1040),(390,560),f64::NAN),(1518,468));
}
#[test] fn small_work_area_shrinks_inner_size_including_window_frame() {
 assert_eq!(fit_inner((300,200),(406,599),(390,560),1.0),(260,137));
 assert_eq!(fit_inner((1920,1040),(406,599),(390,560),2.0),(390,560));
 assert_eq!(bottom_right((40,0),(1880,1080),(780,1120),2.0),(1116,0));
}

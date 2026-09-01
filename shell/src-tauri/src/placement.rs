fn margin(scale:f64)->u32 {
 (12.0*if scale.is_finite()&&scale>0.0 {scale.min(16.0)} else {1.0}).round() as u32
}
pub(crate) fn bottom_right(origin:(i32,i32),work:(u32,u32),outer:(u32,u32),scale:f64)->(i32,i32) {
 let pad=margin(scale) as i64;
 let axis=|start:i32,span:u32,size:u32| (start as i64+(span as i64-size as i64-pad).max(0)).clamp(i32::MIN as i64,i32::MAX as i64) as i32;
 (axis(origin.0,work.0,outer.0),axis(origin.1,work.1,outer.1))
}
pub(crate) fn fit_inner(work:(u32,u32),outer:(u32,u32),inner:(u32,u32),scale:f64)->(u32,u32) {
 let pad=margin(scale)*2;
 let axis=|span:u32,out:u32,inside:u32| inside.min(span.saturating_sub(pad).saturating_sub(out.saturating_sub(inside)).max(1));
 (axis(work.0,outer.0,inner.0),axis(work.1,outer.1,inner.1))
}
#[cfg(test)]
#[path = "../../delivery/tests/placement.rs"]
mod tests;

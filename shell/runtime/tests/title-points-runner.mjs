import {cases} from './title-points-cases.mjs';
const failed=[];
for(const [id,fn] of cases){try{await fn();}catch(e){failed.push({id,message:e.message});}}
console.log('TDD_GUARD_RESULT='+JSON.stringify({tests:cases.length,failures:failed.length,errors:0,category:failed.length?'product_failure':'pass',summary:failed.map(f=>f.id).join(',')||'title semantics pass',failedTests:failed.map(f=>f.id),details:failed}));
process.exitCode=failed.length?1:0;

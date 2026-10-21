import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("both WeiGuo images package imported Ceres curriculum and smoke-test boot imports",()=>{
 const store=readFileSync(new URL("../services/weiguo/ceres_store_bot.py",import.meta.url),"utf8");
 const curriculum=readFileSync(new URL("../services/weiguo/ceres_academy_curriculum.py",import.meta.url),"utf8");
 assert.match(store,/from ceres_academy_curriculum import LESSONS, TOPICS, CHAPTERS/);
 assert.match(curriculum,/LESSONS\s*=/);
 for(const path of ["Dockerfile","Dockerfile.pdfcraft"]){
   const file=readFileSync(new URL("../services/weiguo/"+path,import.meta.url),"utf8");
   assert.match(file,/COPY ceres_academy_curriculum\.py \.\//);
   assert.match(file,/COPY ceres_academy_content\.py \.\//);
   assert.match(file,/RUN python3 -c "import ceres_academy_curriculum, ceres_academy_content, ceres_store_bot/);
   assert.match(file,/RUN python3 -c "import ceres_command_center/);
 }
});

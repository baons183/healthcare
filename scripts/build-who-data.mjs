// Tải bảng LMS chính thức của WHO và tạo file JSON gọn (theo tháng).
// - WHO Child Growth Standards 2006 (0–5 tuổi): repo WorldHealthOrganization/anthro
// - WHO Growth Reference 2007 (5–19 tuổi): repo WorldHealthOrganization/anthroplus
// Chạy: node scripts/build-who-data.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const A = "https://raw.githubusercontent.com/WorldHealthOrganization/anthro/master/data-raw/growthstandards/";
const AP = "https://raw.githubusercontent.com/WorldHealthOrganization/anthroplus/main/data-raw/growthstandards/";

async function table(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const lines = (await res.text()).trim().split(/\r?\n/);
  const head = lines.shift().split("\t");
  return lines.map((l) => {
    const c = l.split("\t");
    const o = {};
    head.forEach((h, i) => (o[h] = c[i]));
    return o;
  });
}

const r = (x, d) => Number(Number(x).toFixed(d));

/** rows tính theo ngày (0–1856) -> map tháng 0..60 */
function fromDays(rows, sex, maxMonth) {
  const out = [];
  for (let m = 0; m <= maxMonth; m++) {
    const day = Math.round(m * 30.4375);
    const cands = rows.filter((x) => Number(x.sex) === sex && Number(x.age) === day);
    if (!cands.length) throw new Error(`missing day ${day}`);
    // chiều dài nằm (L) < 24 tháng, chiều cao đứng (H) từ 24 tháng
    let row = cands[0];
    if (cands.length > 1 && cands[0].loh !== undefined) {
      row = cands.find((x) => x.loh === (day < 731 ? "L" : "H")) ?? cands[0];
    }
    out.push([r(row.l, 4), r(row.m, 4), r(row.s, 5)]);
  }
  return out;
}

/** rows tính theo tháng (60–228) */
function fromMonths(rows, sex, from, to) {
  const out = [];
  for (let m = from; m <= to; m++) {
    const row = rows.find((x) => Number(x.sex) === sex && Number(x.age) === m);
    if (!row) throw new Error(`missing month ${m}`);
    out.push([r(row.l, 4), r(row.m, 4), r(row.s, 5)]);
  }
  return out;
}

const [wei, len, bmi, hc, wfa07, hfa07, bfa07] = await Promise.all([
  table(A + "weianthro.txt"),
  table(A + "lenanthro.txt"),
  table(A + "bmianthro.txt"),
  table(A + "hcanthro.txt"),
  table(AP + "wfawho2007.txt"),
  table(AP + "hfawho2007.txt"),
  table(AP + "bfawho2007.txt"),
]);

const data = { source: "WHO 2006 Child Growth Standards + WHO 2007 Growth Reference", male: {}, female: {} };
for (const [key, sex] of [["male", 1], ["female", 2]]) {
  data[key].weight = [...fromDays(wei, sex, 60), ...fromMonths(wfa07, sex, 61, 120)];
  data[key].height = [...fromDays(len, sex, 60), ...fromMonths(hfa07, sex, 61, 228)];
  data[key].bmi = [...fromDays(bmi, sex, 60), ...fromMonths(bfa07, sex, 61, 228)];
  data[key].head = fromDays(hc, sex, 60);
}

mkdirSync("src/lib/growth", { recursive: true });
writeFileSync("src/lib/growth/who-data.json", JSON.stringify(data));
console.log("OK", Object.fromEntries(Object.entries(data.male).map(([k, v]) => [k, v.length])));

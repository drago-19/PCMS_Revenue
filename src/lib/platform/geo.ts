// ชื่อจังหวัด/อำเภอที่ TikTok ส่งมาไม่เป็นมาตรฐาน
// ในข้อมูลจริงพบ 186 ชื่อ สำหรับ 77 จังหวัด — "กรุงเทพฯ" / "กรุงเทพมหานคร" / "Bangkok" / "曼谷"
// เป็นที่เดียวกัน และมีคำนำหน้าติดมา เช่น "จังหวัดชลบุรี" หรือ "เทศบาลนครเชียงใหม่"
//
// รวมให้เหลือชื่อเดียวต่อจังหวัดก่อนนับยอด ไม่งั้นอันดับ "จังหวัดที่ซื้อเยอะสุด" จะผิด
// (ทำใน SQL เพื่อให้ GROUP BY ถูกต้องตั้งแต่ต้น ไม่ใช่ไปรวมทีหลังซึ่งจำนวนลูกค้าจะนับซ้ำ)

/** คำนำหน้าที่ติดมากับชื่อพื้นที่ — ตัดออกก่อนเทียบ */
const AREA_PREFIX = "^(จังหวัด|จ\\.|เทศบาลนคร|เทศบาลเมือง|เทศบาลตำบล|เทศบาล|ตำบล|แขวง|อำเภอ|เขต)";

/** ชื่อจังหวัดภาษาอังกฤษ/จีน และคำย่อ → ชื่อไทยมาตรฐาน (คีย์ต้องเป็นตัวพิมพ์เล็ก) */
const PROVINCE_ALIASES: Record<string, string> = {
  bangkok: "กรุงเทพมหานคร",
  "krung thep": "กรุงเทพมหานคร",
  "krung thep maha nakhon": "กรุงเทพมหานคร",
  "bangkok metropolis": "กรุงเทพมหานคร",
  กรุงเทพ: "กรุงเทพมหานคร",
  กรุงเทพฯ: "กรุงเทพมหานคร",
  กทม: "กรุงเทพมหานคร",
  "กทม.": "กรุงเทพมหานคร",
  "曼谷": "กรุงเทพมหานคร",
  "也拉府": "ยะลา",
  "amnat charoen": "อำนาจเจริญ",
  "ang thong": "อ่างทอง",
  "bueng kan": "บึงกาฬ",
  "buri ram": "บุรีรัมย์",
  "chachoengsao": "ฉะเชิงเทรา",
  "chai nat": "ชัยนาท",
  "chaiyaphum": "ชัยภูมิ",
  "chanthaburi": "จันทบุรี",
  "chiang mai": "เชียงใหม่",
  "chiang rai": "เชียงราย",
  "chon buri": "ชลบุรี",
  "chumphon": "ชุมพร",
  "kalasin": "กาฬสินธุ์",
  "kamphaeng phet": "กำแพงเพชร",
  "kanchanaburi": "กาญจนบุรี",
  "khon kaen": "ขอนแก่น",
  "krabi": "กระบี่",
  "lampang": "ลำปาง",
  "lamphun": "ลำพูน",
  "loei": "เลย",
  "lop buri": "ลพบุรี",
  "lopburi": "ลพบุรี",
  "mae hong son": "แม่ฮ่องสอน",
  "maha sarakham": "มหาสารคาม",
  "mukdahan": "มุกดาหาร",
  "nakhon nayok": "นครนายก",
  "nakhon pathom": "นครปฐม",
  "nakhon phanom": "นครพนม",
  "nakhon ratchasima": "นครราชสีมา",
  "nakhon sawan": "นครสวรรค์",
  "nakhon si thammarat": "นครศรีธรรมราช",
  "nan": "น่าน",
  "nong khai": "หนองคาย",
  "nonthaburi": "นนทบุรี",
  "pathum thani": "ปทุมธานี",
  "phangnga": "พังงา",
  "phatthalung": "พัทลุง",
  "phayao": "พะเยา",
  "phetchabun": "เพชรบูรณ์",
  "phetchaburi": "เพชรบุรี",
  "phichit": "พิจิตร",
  "phitsanulok": "พิษณุโลก",
  "phra nakhon si ayutthaya": "พระนครศรีอยุธยา",
  "phrae": "แพร่",
  "phuket": "ภูเก็ต",
  "prachin buri": "ปราจีนบุรี",
  "prachuap khiri khan": "ประจวบคีรีขันธ์",
  "ranong": "ระนอง",
  "ratchaburi": "ราชบุรี",
  "rayong": "ระยอง",
  "roi et": "ร้อยเอ็ด",
  "sa kaeo": "สระแก้ว",
  "sakon nakhon": "สกลนคร",
  "samut prakan": "สมุทรปราการ",
  "samut sakhon": "สมุทรสาคร",
  "samut songkhram": "สมุทรสงคราม",
  "saraburi": "สระบุรี",
  "satun": "สตูล",
  "si sa ket": "ศรีสะเกษ",
  "sing buri": "สิงห์บุรี",
  "songkhla": "สงขลา",
  "sukhothai": "สุโขทัย",
  "suphan buri": "สุพรรณบุรี",
  "surat thani": "สุราษฎร์ธานี",
  "surin": "สุรินทร์",
  "tak": "ตาก",
  "trang": "ตรัง",
  "trat": "ตราด",
  "ubon ratchathani": "อุบลราชธานี",
  "udon thani": "อุดรธานี",
  "uthai thani": "อุทัยธานี",
  "uttaradit": "อุตรดิตถ์",
  "yala": "ยะลา",
  "yasothon": "ยโสธร",
};

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * นิพจน์ SQL ที่คืนชื่อจังหวัดมาตรฐานของคอลัมน์ที่ส่งเข้ามา
 * ใช้ใน GROUP BY ได้เลย — ค่าคงที่ทั้งหมดมาจากไฟล์นี้ ไม่ได้มาจากผู้ใช้
 */
export function normalizeProvinceSql(column: string): string {
  const cases = Object.entries(PROVINCE_ALIASES)
    .map(([alias, name]) => `WHEN '${escapeSql(alias)}' THEN '${escapeSql(name)}'`)
    .join(" ");
  const stripped = `btrim(regexp_replace(btrim(${column}), '${AREA_PREFIX}\\s*', ''))`;
  return `CASE lower(${stripped}) ${cases} ELSE ${stripped} END`;
}

/** นิพจน์ SQL ที่ตัดคำนำหน้าออกจากชื่ออำเภอ/เขต เช่น "เขตคลองสาน" → "คลองสาน" */
export function normalizeDistrictSql(column: string): string {
  return `btrim(regexp_replace(btrim(${column}), '${AREA_PREFIX}\\s*', ''))`;
}

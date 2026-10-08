/* Store Setup · the product catalogue.

   What a distributor picks from instead of remembering. FOOD ONLY (26 Sep
   2026: the owner's store sells food; soap, detergent, shampoo and the rest
   went, with the eight companies that sold only those).

   Two ways in, the two ways a distributor already thinks:
   - by company ("I am the Parle distributor"): companies → brands → items;
   - by type, the aisles of a shop (`aisles` below): Vegetables, Eggs,
     Biscuits… Fresh and loose goods have no company at all, so this is the
     only way to them.

   REAL PHOTOS. Every item carries a real pack photo and its barcode from the
   open product databases Open Food Facts, Open Beauty Facts and Open Products
   Facts (photos CC BY-SA, credited on screen). Each photo was matched to the
   product and checked by hand as an India pack; an item without a verified
   photo is not listed. No brand logos: those are trademarks.

   HONESTY RULES
   - MRPs are INDICATIVE. Most packs here are price-point packs (₹5, ₹10, ₹20),
     whose MRP is stable and whose grammage moves; the rest are close to the
     shelf in 2026 but must be checked on the pack. The export marks every
     catalogue MRP "catalogue — check on pack" until the owner touches it.
   - GST is by category, from the GST 2.0 slabs that apply from 22 Sep 2025
     (5% merit, 18% standard, 40% aerated drinks). It is a starting point for
     the accountant, not tax advice. The export says so.
   - Case sizes are typical outers. The owner corrects them in one tap.

   Adding a company or an item is a one-line edit below: nothing else changes.
   Item row: [id, companyId, brand, name, pack, mrp, piecesPerCase, category, barcode, photo]
   Loose row: [id, category, English name, Hindi name, sold per, picture]

   LOOSE AND FRESH goods (vegetables, fruit, eggs, meat, loose dal…) have no
   brand, no MRP, no barcode and no pack photo. Each is sold per kg, dozen,
   tray, bunch, piece, litre or pack, and shows as a picture (an emoji, which
   needs no internet and carries no licence). The owner gives the price;
   nothing is guessed. GST for fresh, unbranded food is 0%; paneer and curd
   are at 5% and dry fruit at 5% — the accountant confirms, as for all GST.
   Photo prefixes: off: / obf: / opf: → images.open{food,beauty,products}facts.org/images/products/ */

(function (root) {
  "use strict";

  const WM = "https://upload.wikimedia.org/wikipedia/commons/thumb/";
  const PHOTO = { off: "https://images.openfoodfacts.org/images/products/", obf: "https://images.openbeautyfacts.org/images/products/", opf: "https://images.openproductsfacts.org/images/products/" };

  const categories = {
    biscuit: {"icon": "🍪", "hsn": "1905", "gst": 5, "en": "Biscuits & cakes", "hi": "बिस्किट और केक"},
    namkeen: {"icon": "🥨", "hsn": "2106", "gst": 5, "en": "Namkeen", "hi": "नमकीन"},
    chips: {"icon": "🥔", "hsn": "2005", "gst": 5, "en": "Chips & wafers", "hi": "चिप्स / वेफर्स"},
    noodles: {"icon": "🍜", "hsn": "1902", "gst": 5, "en": "Noodles & pasta", "hi": "नूडल्स"},
    choco: {"icon": "🍫", "hsn": "1806", "gst": 5, "en": "Chocolates", "hi": "चॉकलेट"},
    sweets: {"icon": "🍬", "hsn": "1704", "gst": 5, "en": "Sweets & toffee", "hi": "मिठाई / टॉफ़ी"},
    tea: {"icon": "🍵", "hsn": "0902", "gst": 5, "en": "Tea", "hi": "चाय पत्ती"},
    coffee: {"icon": "☕", "hsn": "2101", "gst": 5, "en": "Coffee", "hi": "कॉफ़ी"},
    healthdrink: {"icon": "🥤", "hsn": "1901", "gst": 5, "en": "Health & milk drinks", "hi": "हेल्थ ड्रिंक"},
    milk: {"icon": "🥛", "hsn": "0401", "gst": 0, "en": "Milk & buttermilk", "hi": "दूध / छाछ"},
    milkpowder: {"icon": "🥛", "hsn": "0402", "gst": 5, "en": "Milk powder", "hi": "दूध पाउडर"},
    dairy: {"icon": "🧈", "hsn": "0405", "gst": 5, "en": "Ghee & butter", "hi": "घी / मक्खन"},
    cheese: {"icon": "🧀", "hsn": "0406", "gst": 5, "en": "Cheese", "hi": "चीज़"},
    babyfood: {"icon": "🍼", "hsn": "1901", "gst": 5, "en": "Baby food", "hi": "बेबी फ़ूड"},
    sauce: {"icon": "🍅", "hsn": "2103", "gst": 5, "en": "Sauces & ketchup", "hi": "सॉस / केचप"},
    jam: {"icon": "🍯", "hsn": "2007", "gst": 5, "en": "Jam & honey", "hi": "जैम / शहद"},
    ready: {"icon": "🍲", "hsn": "2104", "gst": 5, "en": "Soups & ready mixes", "hi": "सूप / रेडी मिक्स"},
    cereal: {"icon": "🥣", "hsn": "1904", "gst": 5, "en": "Cereals & oats", "hi": "कॉर्नफ्लेक्स / ओट्स"},
    oil: {"icon": "🛢️", "hsn": "1512", "gst": 5, "en": "Cooking oil", "hi": "खाने का तेल"},
    spice: {"icon": "🌶️", "hsn": "0910", "gst": 5, "en": "Spices & masala", "hi": "मसाले"},
    salt: {"icon": "🧂", "hsn": "2501", "gst": 0, "en": "Salt", "hi": "नमक"},
    atta: {"icon": "🌾", "hsn": "1101", "gst": 5, "en": "Atta, rice & besan", "hi": "आटा / चावल / बेसन"},
    dal: {"icon": "🫘", "hsn": "0713", "gst": 5, "en": "Dal & pulses", "hi": "दाल"},
    sugar: {"icon": "🍚", "hsn": "1701", "gst": 5, "en": "Sugar", "hi": "चीनी"},
    water: {"icon": "💧", "hsn": "2201", "gst": 5, "en": "Drinking water", "hi": "पानी की बोतल"},
    juice: {"icon": "🧃", "hsn": "2202", "gst": 5, "en": "Juice & fruit drinks", "hi": "जूस"},
    softdrink: {"icon": "🥤", "hsn": "2202", "gst": 40, "en": "Cold drinks (fizzy)", "hi": "कोल्ड ड्रिंक"},
    veg: {"icon": "🥕", "hsn": "0709", "gst": 0, "en": "Vegetables", "hi": "सब्ज़ी"},
    fruit: {"icon": "🍎", "hsn": "0810", "gst": 0, "en": "Fruits", "hi": "फल"},
    eggs: {"icon": "🥚", "hsn": "0407", "gst": 0, "en": "Eggs", "hi": "अंडे"},
    meat: {"icon": "🍗", "hsn": "0207", "gst": 0, "en": "Chicken, meat & fish", "hi": "चिकन, मटन, मछली"},
    freshdairy: {"icon": "🧀", "hsn": "0406", "gst": 5, "en": "Paneer & curd", "hi": "पनीर / दही"},
    grains: {"icon": "🍚", "hsn": "1006", "gst": 0, "en": "Loose rice, wheat & dal", "hi": "खुला चावल, गेहूँ, दाल"},
    dryfruit: {"icon": "🥜", "hsn": "0802", "gst": 5, "en": "Dry fruits & nuts", "hi": "सूखे मेवे"},
    other: {"icon": "📦", "hsn": "", "gst": 18, "en": "Other", "hi": "दूसरा सामान"},
  };

  const companies = [
    {"id": "hul", "name": "Hindustan Unilever", "short": "HUL", "color": "#1F5AA6"},
    {"id": "itc", "name": "ITC", "short": "ITC", "color": "#1B4F72"},
    {"id": "nestle", "name": "Nestlé", "short": "Nestlé", "color": "#5B7A99"},
    {"id": "brit", "name": "Britannia", "short": "Britannia", "color": "#C8102E"},
    {"id": "parle", "name": "Parle Products", "short": "Parle", "color": "#D99A00"},
    {"id": "mdlz", "name": "Mondelez (Cadbury)", "short": "Cadbury", "color": "#4B2A7B"},
    {"id": "pepsi", "name": "PepsiCo", "short": "PepsiCo", "color": "#004B93"},
    {"id": "coke", "name": "Coca-Cola", "short": "Coca-Cola", "color": "#D71A28"},
    {"id": "pagro", "name": "Parle Agro", "short": "Parle Agro", "color": "#E8751A"},
    {"id": "amul", "name": "Amul", "short": "Amul", "color": "#0072BC"},
    {"id": "tata", "name": "Tata Consumer", "short": "Tata", "color": "#1A4E8A"},
    {"id": "dabur", "name": "Dabur", "short": "Dabur", "color": "#00843D"},
    {"id": "marico", "name": "Marico", "short": "Marico", "color": "#2E3192"},
    {"id": "awl", "name": "AWL Agri (Fortune)", "short": "Fortune", "color": "#C4161C"},
    {"id": "patanjali", "name": "Patanjali", "short": "Patanjali", "color": "#E07000"},
    {"id": "haldiram", "name": "Haldiram's", "short": "Haldiram's", "color": "#B3121B"},
    {"id": "bikaji", "name": "Bikaji", "short": "Bikaji", "color": "#D2232A"},
    {"id": "balaji", "name": "Balaji Wafers", "short": "Balaji", "color": "#C62828"},
    {"id": "mdh", "name": "MDH", "short": "MDH", "color": "#A0141E"},
    {"id": "everest", "name": "Everest", "short": "Everest", "color": "#9E1B32"},
    {"id": "bisleri", "name": "Bisleri", "short": "Bisleri", "color": "#00897B"},
    {"id": "mdairy", "name": "Mother Dairy", "short": "Mother Dairy", "color": "#0C4DA2"},
    {"id": "kelloggs", "name": "Kellogg's", "short": "Kellogg's", "color": "#C62D1F"},
    {"id": "renuka", "name": "Shree Renuka (Madhur)", "short": "Madhur", "color": "#7A5C00"},
  ];

  /* [id, companyId, brand, name, pack, mrp, piecesPerCase, category, barcode, photo] */
  const rows = [
    // Hindustan Unilever
    ["hul20", "hul", "Red Label", "Brooke Bond Red Label", "250 g", 150, 36, "tea", "8901030877124", "off:890/103/087/7124/front_en.3.200.jpg"],
    ["hul21", "hul", "Red Label", "Brooke Bond Red Label", "₹10 pack", 10, 200, "tea", "8901030877124", "off:890/103/087/7124/front_en.3.200.jpg"],
    ["hul22", "hul", "Taj Mahal", "Taj Mahal Tea", "250 g", 220, 36, "tea", "8901030815140", "off:890/103/081/5140/front_en.5.200.jpg"],
    ["hul23", "hul", "Bru", "Bru Instant Coffee", "50 g", 115, 48, "coffee", "8901030519017", "off:890/103/051/9017/front_en.3.200.jpg"],
    ["hul24", "hul", "Kissan", "Kissan Fresh Tomato Ketchup", "850 g pouch", 110, 12, "sauce", "8901030534898", "off:890/103/053/4898/front.5.200.jpg"],
    ["hul25", "hul", "Kissan", "Kissan Mixed Fruit Jam", "200 g", 85, 24, "jam", "8901030922787", "off:890/103/092/2787/front_en.3.200.jpg"],
    ["hul27", "hul", "Horlicks", "Horlicks Classic Malt", "500 g jar", 250, 12, "healthdrink", "8901030993398", "off:890/103/099/3398/front_en.3.200.jpg"],

    // ITC
    ["itc01", "itc", "Aashirvaad", "Aashirvaad Shudh Chakki Atta", "5 kg", 280, 4, "atta", "8901725121129", "off:890/172/512/1129/front_en.30.200.jpg"],
    ["itc02", "itc", "Aashirvaad", "Aashirvaad Shudh Chakki Atta", "10 kg", 520, 2, "atta", "8901725121129", "off:890/172/512/1129/front_en.30.200.jpg"],
    ["itc03", "itc", "Aashirvaad", "Aashirvaad Salt", "1 kg", 28, 25, "salt", "8901725123123", "off:890/172/512/3123/front_en.13.200.jpg"],
    ["itc04", "itc", "Sunfeast", "Sunfeast Marie Light", "₹10 pack", 10, 72, "biscuit", "3948725000370", "off:394/872/500/0370/front_en.3.200.jpg"],
    ["itc05", "itc", "Sunfeast", "Sunfeast Dark Fantasy Choco Fills", "75 g", 40, 48, "biscuit", "8901725015879", "off:890/172/501/5879/front_en.16.200.jpg"],
    ["itc06", "itc", "Sunfeast", "Sunfeast Mom's Magic Cashew & Almond", "₹10 pack", 10, 72, "biscuit", "8901725013066", "off:890/172/501/3066/front_en.15.200.jpg"],
    ["itc07", "itc", "Bingo!", "Bingo! Mad Angles Achaari Masti", "₹10 pack", 10, 60, "chips", "8901725198558", "off:890/172/519/8558/front.4.200.jpg"],
    ["itc09", "itc", "Yippee!", "Yippee! Magic Masala Noodles", "60 g", 15, 96, "noodles", "8901725012830", "off:890/172/501/2830/front_en.3.200.jpg"],
    ["itc10", "itc", "B Natural", "B Natural Mixed Fruit", "1 L", 120, 12, "juice", "8901725100025", "off:890/172/510/0025/front_en.18.200.jpg"],

    // Nestlé
    ["nes01", "nestle", "Maggi", "Maggi 2-Minute Masala Noodles", "70 g", 15, 96, "noodles", "8901058905441", "off:890/105/890/5441/front_en.3.200.jpg"],
    ["nes02", "nestle", "Maggi", "Maggi Masala Noodles 4-pack", "280 g", 56, 24, "noodles", "8901058000306", "off:890/105/800/0306/front_en.10.200.jpg"],
    ["nes03", "nestle", "Maggi", "Maggi Masala-ae-Magic", "₹5 sachet", 5, 240, "spice", "0041056003003", "off:004/105/600/3003/front_en.3.200.jpg"],
    ["nes04", "nestle", "KitKat", "KitKat 2 Finger", "₹10", 10, 144, "choco", "7613035221390", "off:761/303/522/1390/front_en.3.200.jpg"],
    ["nes05", "nestle", "Munch", "Munch", "₹10", 10, 144, "choco", "8901058010701", "off:890/105/801/0701/front_en.3.200.jpg"],
    ["nes06", "nestle", "Milkybar", "Milkybar Choo", "₹5", 5, 240, "choco", "8901058859331", "off:890/105/885/9331/front_en.4.200.jpg"],
    ["nes07", "nestle", "Nescafé", "Nescafé Classic", "50 g jar", 180, 48, "coffee", "9556001140159", "off:955/600/114/0159/front_en.5.200.jpg"],
    ["nes08", "nestle", "Everyday", "Nestlé Everyday Dairy Whitener", "200 g", 105, 48, "milkpowder", "8901058869453", "off:890/105/886/9453/front_en.3.200.jpg"],
    ["nes09", "nestle", "Cerelac", "Cerelac Wheat Apple", "300 g", 225, 24, "babyfood", "6294017129012", "off:629/401/712/9012/front_en.3.200.jpg"],

    // Britannia
    ["bri01", "brit", "Good Day", "Good Day Cashew", "₹10 pack", 10, 72, "biscuit", "8901063093089", "off:890/106/309/3089/front_en.10.200.jpg"],
    ["bri02", "brit", "Good Day", "Good Day Butter", "₹5 pack", 5, 144, "biscuit", "0027407900016", "off:002/740/790/0016/front_en.3.200.jpg"],
    ["bri03", "brit", "Marie Gold", "Marie Gold", "₹10 pack", 10, 72, "biscuit", "8901063162365", "off:890/106/316/2365/front_en.3.200.jpg"],
    ["bri04", "brit", "Bourbon", "Britannia Bourbon", "₹10 pack", 10, 72, "biscuit", "8901063136915", "off:890/106/313/6915/front_en.3.200.jpg"],
    ["bri05", "brit", "Tiger", "Tiger Glucose", "₹5 pack", 5, 144, "biscuit", "8901063163287", "off:890/106/316/3287/front_en.3.200.jpg"],
    ["bri06", "brit", "50-50", "50-50 Maska Chaska", "₹10 pack", 10, 72, "biscuit", "8901063017481", "off:890/106/301/7481/front_en.4.200.jpg"],
    ["bri07", "brit", "Milk Bikis", "Milk Bikis", "₹10 pack", 10, 72, "biscuit", "8901063012516", "off:890/106/301/2516/front_en.3.200.jpg"],
    ["bri08", "brit", "Treat", "Treat Jim Jam", "₹10 pack", 10, 72, "biscuit", "8901063029217", "off:890/106/302/9217/front_en.14.200.jpg"],
    ["bri09", "brit", "NutriChoice", "NutriChoice Digestive", "250 g", 55, 30, "biscuit", "8901063142022", "off:890/106/314/2022/front_en.4.200.jpg"],
    ["bri10", "brit", "Britannia Cake", "Britannia Fruit Cake", "₹20 pack", 20, 48, "biscuit", "8901063362857", "off:890/106/336/2857/front_en.7.200.jpg"],
    ["bri11", "brit", "Toastea", "Toastea Premium Bake Rusk", "200 g", 40, 30, "biscuit", "8901063325746", "off:890/106/332/5746/front_en.4.200.jpg"],
    ["bri12", "brit", "Britannia Cheese", "Britannia Cheese Slices", "200 g", 140, 20, "cheese", "8901063401457", "off:890/106/340/1457/front_en.4.200.jpg"],

    // Parle Products
    ["par01", "parle", "Parle-G", "Parle-G", "₹5 pack", 5, 144, "biscuit", "8901719100956", "off:890/171/910/0956/front_en.8.200.jpg"],
    ["par02", "parle", "Parle-G", "Parle-G", "₹10 pack", 10, 72, "biscuit", "8901719100956", "off:890/171/910/0956/front_en.8.200.jpg"],
    ["par03", "parle", "Parle-G", "Parle-G Family Pack", "800 g", 100, 12, "biscuit", "8901719100956", "off:890/171/910/0956/front_en.8.200.jpg"],
    ["par04", "parle", "Monaco", "Monaco Classic", "₹10 pack", 10, 72, "biscuit", "8901719121432", "off:890/171/912/1432/front_en.14.200.jpg"],
    ["par05", "parle", "Krackjack", "Krackjack", "₹10 pack", 10, 72, "biscuit", "8901719122187", "off:890/171/912/2187/front_en.3.200.jpg"],
    ["par06", "parle", "Hide & Seek", "Hide & Seek Choco Chip", "₹10 pack", 10, 72, "biscuit", "3948719127465", "off:394/871/912/7465/front_en.3.200.jpg"],
    ["par07", "parle", "20-20", "20-20 Cashew Cookies", "₹10 pack", 10, 72, "biscuit", "8901719131141", "off:890/171/913/1141/front_en.3.200.jpg"],
    ["par08", "parle", "Milano", "Milano Chocolate Chip", "75 g", 40, 48, "biscuit", "8901719125768", "off:890/171/912/5768/front_en.9.200.jpg"],
    ["par09", "parle", "Parle Rusk", "Parle Rusk", "200 g", 40, 30, "biscuit", "8901719128554", "off:890/171/912/8554/front_en.3.200.jpg"],
    ["par10", "parle", "Melody", "Melody Chocolaty (100 pcs)", "bag", 100, 12, "sweets", "8901719127786", "off:890/171/912/7786/front_en.6.200.jpg"],
    ["par12", "parle", "Poppins", "Poppins", "₹5", 5, 240, "sweets", "8901719127144", "off:890/171/912/7144/front_en.3.200.jpg"],

    // Mondelez (Cadbury)
    ["mdz01", "mdlz", "Dairy Milk", "Cadbury Dairy Milk", "₹10", 10, 144, "choco", "7622201443290", "off:762/220/144/3290/front_en.3.200.jpg"],
    ["mdz02", "mdlz", "Dairy Milk", "Cadbury Dairy Milk", "₹20", 20, 96, "choco", "7622201443290", "off:762/220/144/3290/front_en.3.200.jpg"],
    ["mdz03", "mdlz", "Dairy Milk Silk", "Cadbury Dairy Milk Silk", "60 g", 90, 48, "choco", "8901233034300", "off:890/123/303/4300/front_en.6.200.jpg"],
    ["mdz04", "mdlz", "5 Star", "Cadbury 5 Star", "₹10", 10, 144, "choco", "7622201494476", "off:762/220/149/4476/front_en.3.200.jpg"],
    ["mdz05", "mdlz", "5 Star", "Cadbury 5 Star", "₹5", 5, 240, "choco", "7622201494476", "off:762/220/149/4476/front_en.3.200.jpg"],
    ["mdz06", "mdlz", "Perk", "Cadbury Perk", "₹5", 5, 240, "choco", "8901233024042", "off:890/123/302/4042/front_en.3.200.jpg"],
    ["mdz07", "mdlz", "Gems", "Cadbury Gems", "₹10", 10, 144, "choco", "7622201798260", "off:762/220/179/8260/front_en.47.200.jpg"],
    ["mdz08", "mdlz", "Oreo", "Oreo Vanilla Creme", "₹10 pack", 10, 72, "biscuit", "7622210137234", "off:762/221/013/7234/front_en.62.200.jpg"],
    ["mdz09", "mdlz", "Bournvita", "Cadbury Bournvita", "500 g jar", 245, 12, "healthdrink", "7622202026423", "off:762/220/202/6423/front_en.3.200.jpg"],
    ["mdz10", "mdlz", "Bournvita", "Cadbury Bournvita refill", "1 kg", 420, 8, "healthdrink", "7622202026423", "off:762/220/202/6423/front_en.3.200.jpg"],

    // PepsiCo
    ["pep01", "pepsi", "Lay's", "Lay's India's Magic Masala", "₹10 pack", 10, 60, "chips", "8901491502023", "off:890/149/150/2023/front_en.6.200.jpg"],
    ["pep02", "pepsi", "Lay's", "Lay's Classic Salted", "₹20 pack", 20, 40, "chips", "8901491101837", "off:890/149/110/1837/front_en.14.200.jpg"],
    ["pep03", "pepsi", "Kurkure", "Kurkure Masala Munch", "₹10 pack", 10, 60, "namkeen", "5000328314907", "off:500/032/831/4907/front_en.3.200.jpg"],
    ["pep04", "pepsi", "Kurkure", "Kurkure Masala Munch", "₹20 pack", 20, 40, "namkeen", "5000328314907", "off:500/032/831/4907/front_en.3.200.jpg"],
    ["pep05", "pepsi", "Uncle Chipps", "Uncle Chipps Spicy Treat", "₹10 pack", 10, 60, "chips", "8901491435109", "off:890/149/143/5109/front_en.3.200.jpg"],
    ["pep06", "pepsi", "Doritos", "Doritos Nacho Cheese", "₹20 pack", 20, 40, "chips", "6281036008305", "off:628/103/600/8305/front_en.3.200.jpg"],
    ["pep08", "pepsi", "Pepsi", "Pepsi", "250 ml", 20, 24, "softdrink", "87156836", "off:87156836/front_en.9.200.jpg"],
    ["pep09", "pepsi", "Pepsi", "Pepsi", "750 ml", 40, 24, "softdrink", "87156836", "off:87156836/front_en.9.200.jpg"],
    ["pep10", "pepsi", "Pepsi", "Pepsi", "2.25 L", 99, 6, "softdrink", "87156836", "off:87156836/front_en.9.200.jpg"],
    ["pep11", "pepsi", "7UP", "7UP", "750 ml", 40, 24, "softdrink", "0065400000968", "off:006/540/000/0968/front.3.200.jpg"],

    // Coca-Cola
    ["coc01", "coke", "Thums Up", "Thums Up", "250 ml", 20, 24, "softdrink", "8901764042911", "off:890/176/404/2911/front_en.41.200.jpg"],
    ["coc02", "coke", "Thums Up", "Thums Up", "750 ml", 40, 24, "softdrink", "8901764042911", "off:890/176/404/2911/front_en.41.200.jpg"],
    ["coc03", "coke", "Thums Up", "Thums Up", "2 L", 95, 9, "softdrink", "8901764042911", "off:890/176/404/2911/front_en.41.200.jpg"],
    ["coc04", "coke", "Coca-Cola", "Coca-Cola", "750 ml", 40, 24, "softdrink", "57045399", "off:57045399/front_en.9.200.jpg"],
    ["coc05", "coke", "Sprite", "Sprite", "250 ml", 20, 24, "softdrink", "8901764032905", "off:890/176/403/2905/front_en.28.200.jpg"],
    ["coc06", "coke", "Sprite", "Sprite", "750 ml", 40, 24, "softdrink", "8901764032905", "off:890/176/403/2905/front_en.28.200.jpg"],
    ["coc07", "coke", "Fanta", "Fanta Orange", "750 ml", 40, 24, "softdrink", "5000112647815", "off:500/011/264/7815/front_en.17.200.jpg"],
    ["coc08", "coke", "Limca", "Limca", "750 ml", 40, 24, "softdrink", "89000601", "off:89000601/front_en.3.200.jpg"],
    ["coc09", "coke", "Maaza", "Maaza", "250 ml", 20, 30, "juice", "3948764175022", "off:394/876/417/5022/front_en.12.200.jpg"],
    ["coc10", "coke", "Maaza", "Maaza", "600 ml", 40, 24, "juice", "3948764175022", "off:394/876/417/5022/front_en.12.200.jpg"],
    ["coc11", "coke", "Kinley", "Kinley Water", "500 ml", 10, 24, "water", "89000724", "off:89000724/front_en.15.200.jpg"],
    ["coc12", "coke", "Kinley", "Kinley Water", "1 L", 20, 12, "water", "89000724", "off:89000724/front_en.15.200.jpg"],

    // Parle Agro
    ["pag01", "pagro", "Frooti", "Frooti", "₹10 tetra", 10, 40, "juice", "8902579103354", "off:890/257/910/3354/front_en.6.200.jpg"],
    ["pag02", "pagro", "Frooti", "Frooti", "600 ml", 40, 24, "juice", "8902579103354", "off:890/257/910/3354/front_en.6.200.jpg"],
    ["pag03", "pagro", "Appy Fizz", "Appy Fizz", "250 ml", 20, 24, "softdrink", "8902579002039", "off:890/257/900/2039/front_en.3.200.jpg"],
    ["pag04", "pagro", "Smoodh", "Smoodh Chocolate", "₹10", 10, 30, "healthdrink", "8902579002664", "off:890/257/900/2664/front_en.3.200.jpg"],

    // Amul
    ["amu01", "amul", "Amul Butter", "Amul Butter", "100 g", 58, 40, "dairy", "8901262010153", "off:890/126/201/0153/front_en.3.200.jpg"],
    ["amu02", "amul", "Amul Butter", "Amul Butter", "500 g", 275, 20, "dairy", "8901262010153", "off:890/126/201/0153/front_en.3.200.jpg"],
    ["amu03", "amul", "Amul Ghee", "Amul Pure Ghee", "1 L", 610, 12, "dairy", "0656846560460", "off:065/684/656/0460/front_en.3.200.jpg"],
    ["amu04", "amul", "Amul Ghee", "Amul Pure Ghee", "500 ml", 305, 20, "dairy", "0656846560460", "off:065/684/656/0460/front_en.3.200.jpg"],
    ["amu05", "amul", "Amul Cheese", "Amul Cheese Slices", "200 g", 140, 20, "cheese", "2000000136641", "off:200/000/013/6641/front_en.4.200.jpg"],
    ["amu06", "amul", "Amul Taaza", "Amul Taaza Toned Milk (UHT)", "1 L", 75, 12, "milk", "8901262260121", "off:890/126/226/0121/front_en.28.200.jpg"],
    ["amu07", "amul", "Amul Masti", "Amul Masti Buttermilk", "200 ml", 15, 30, "milk", "8901262200233", "off:890/126/220/0233/front_en.3.200.jpg"],
    ["amu08", "amul", "Amul Kool", "Amul Kool Kesar", "180 ml", 25, 30, "healthdrink", "8901262152211", "off:890/126/215/2211/front_en.6.200.jpg"],
    ["amu09", "amul", "Amul Chocolate", "Amul Dark Chocolate", "150 g", 120, 24, "choco", "8901262070454", "off:890/126/207/0454/front_en.4.200.jpg"],

    // Tata Consumer
    ["tat01", "tata", "Tata Salt", "Tata Salt", "1 kg", 28, 25, "salt", "8904043901015", "off:890/404/390/1015/front_en.34.200.jpg"],
    ["tat02", "tata", "Tata Salt", "Tata Salt Lite", "1 kg", 45, 25, "salt", "8904043901077", "off:890/404/390/1077/front_en.9.200.jpg"],
    ["tat03", "tata", "Tata Tea", "Tata Tea Premium", "250 g", 140, 40, "tea", "8901052000722", "off:890/105/200/0722/front_en.3.200.jpg"],
    ["tat04", "tata", "Tata Tea", "Tata Tea Premium", "₹10 pack", 10, 200, "tea", "8901052000722", "off:890/105/200/0722/front_en.3.200.jpg"],
    ["tat05", "tata", "Tata Tea", "Tata Tea Gold", "250 g", 180, 40, "tea", "8901052003723", "off:890/105/200/3723/front_en.3.200.jpg"],
    ["tat06", "tata", "Tata Tea", "Tata Tea Agni", "250 g", 90, 40, "tea", "8901052003839", "off:890/105/200/3839/front_en.5.200.jpg"],
    ["tat07", "tata", "Tetley", "Tetley Green Tea", "25 bags", 150, 24, "tea", "8901052087808", "off:890/105/208/7808/front_en.4.200.jpg"],
    ["tat08", "tata", "Tata Sampann", "Tata Sampann Chana Dal", "500 g", 75, 20, "dal", "8904043926629", "off:890/404/392/6629/front_en.5.200.jpg"],
    ["tat09", "tata", "Tata Sampann", "Tata Sampann Besan", "500 g", 70, 20, "atta", "8904043926728", "off:890/404/392/6728/front_en.3.200.jpg"],
    ["tat10", "tata", "Ching's", "Ching's Schezwan Chutney", "250 g", 95, 24, "sauce", "8901595862962", "off:890/159/586/2962/front_en.24.200.jpg"],
    ["tat11", "tata", "Ching's", "Ching's Hakka Noodles", "150 g", 40, 48, "noodles", "8901595972258", "off:890/159/597/2258/front_en.3.200.jpg"],

    // Dabur
    ["dab05", "dabur", "Dabur Honey", "Dabur Honey", "500 g", 225, 24, "jam", "8901207047473", "off:890/120/704/7473/front_en.5.200.jpg"],
    ["dab06", "dabur", "Real", "Real Fruit Power Mixed Fruit", "1 L", 125, 12, "juice", "8901207043185", "off:890/120/704/3185/front_en.3.200.jpg"],
    ["dab07", "dabur", "Chyawanprash", "Dabur Chyawanprash", "500 g", 225, 24, "healthdrink", "8901207006241", "off:890/120/700/6241/front_en.5.200.jpg"],
    ["dab08", "dabur", "Hajmola", "Hajmola Regular", "120 tablets", 65, 48, "sweets", "89004869", "off:89004869/front_en.4.200.jpg"],

    // Marico
    ["mar05", "marico", "Saffola", "Saffola Gold Oil", "1 L", 205, 12, "oil", "8901088017411", "off:890/108/801/7411/front_en.3.200.jpg"],
    ["mar06", "marico", "Saffola", "Saffola Masala Oats", "₹15 pack", 15, 72, "cereal", "8901088194839", "off:890/108/819/4839/front_en.3.200.jpg"],
    ["mar07", "marico", "Saffola", "Saffola Oats", "1 kg", 190, 12, "cereal", "8901088050562", "off:890/108/805/0562/front_en.3.200.jpg"],

    // AWL Agri (Fortune)
    ["awl01", "awl", "Fortune", "Fortune Sunlite Sunflower Oil", "1 L pouch", 155, 10, "oil", "8906007280280", "off:890/600/728/0280/front_en.3.200.jpg"],
    ["awl02", "awl", "Fortune", "Fortune Kachi Ghani Mustard Oil", "1 L", 170, 12, "oil", "8906007280952", "off:890/600/728/0952/front_en.4.200.jpg"],
    ["awl03", "awl", "Fortune", "Fortune Soya Health Oil", "1 L pouch", 140, 10, "oil", "8906007280037", "off:890/600/728/0037/front_en.3.200.jpg"],
    ["awl04", "awl", "Fortune", "Fortune Chakki Fresh Atta", "5 kg", 255, 4, "atta", "0892786120030", "off:089/278/612/0030/front_en.3.200.jpg"],
    ["awl05", "awl", "Fortune", "Fortune Rozana Basmati Rice", "5 kg", 450, 4, "atta", "8906007287883", "off:890/600/728/7883/front_en.4.200.jpg"],

    // Patanjali
    ["pat03", "patanjali", "Patanjali", "Patanjali Cow Ghee", "1 L", 650, 12, "dairy", "8904109490545", "off:890/410/949/0545/front_en.4.200.jpg"],
    ["pat04", "patanjali", "Patanjali", "Patanjali Honey", "500 g", 180, 24, "jam", "8904109401589", "off:890/410/940/1589/front_en.3.200.jpg"],

    // Haldiram's
    ["hal01", "haldiram", "Haldiram's", "Haldiram's Aloo Bhujia", "₹10 pack", 10, 60, "namkeen", "8904063214331", "off:890/406/321/4331/front_en.3.200.jpg"],
    ["hal02", "haldiram", "Haldiram's", "Haldiram's Aloo Bhujia", "200 g", 55, 30, "namkeen", "8904063214331", "off:890/406/321/4331/front_en.3.200.jpg"],
    ["hal03", "haldiram", "Haldiram's", "Haldiram's Moong Dal", "200 g", 55, 30, "namkeen", "8904063200136", "off:890/406/320/0136/front_en.27.200.jpg"],
    ["hal04", "haldiram", "Haldiram's", "Haldiram's Navrattan", "200 g", 55, 30, "namkeen", "8904063230126", "off:890/406/323/0126/front_en.3.200.jpg"],
    ["hal05", "haldiram", "Haldiram's", "Haldiram's Khatta Meetha", "₹10 pack", 10, 60, "namkeen", "8904063200952", "off:890/406/320/0952/front_en.3.200.jpg"],
    ["hal06", "haldiram", "Haldiram's", "Haldiram's Soan Papdi", "250 g", 85, 24, "sweets", "8904004405316", "off:890/400/440/5316/front_en.19.200.jpg"],
    ["hal07", "haldiram", "Haldiram's", "Haldiram's Rasgulla tin", "1 kg", 190, 12, "sweets", "8904004405729", "off:890/400/440/5729/front_en.7.200.jpg"],

    // Bikaji
    ["bik01", "bikaji", "Bikaji", "Bikaji Bikaneri Bhujia", "₹10 pack", 10, 60, "namkeen", "8906005500090", "off:890/600/550/0090/front_en.4.200.jpg"],
    ["bik02", "bikaji", "Bikaji", "Bikaji Bikaneri Bhujia", "200 g", 55, 30, "namkeen", "8906005500090", "off:890/600/550/0090/front_en.4.200.jpg"],
    ["bik04", "bikaji", "Bikaji", "Bikaji Rasgulla tin", "1 kg", 180, 12, "sweets", "8906005502063", "off:890/600/550/2063/front_en.3.200.jpg"],

    // Balaji Wafers
    ["bal03", "balaji", "Balaji", "Balaji Chataka Pataka", "₹10 pack", 10, 60, "namkeen", "8906010505424", "off:890/601/050/5424/front_en.3.200.jpg"],

    // MDH
    ["mdh01", "mdh", "MDH", "MDH Deggi Mirch", "100 g", 90, 48, "spice", "8902167000034", "off:890/216/700/0034/front_en.3.200.jpg"],
    ["mdh02", "mdh", "MDH", "MDH Kitchen King", "100 g", 88, 48, "spice", "8902167000102", "off:890/216/700/0102/front_en.17.200.jpg"],
    ["mdh04", "mdh", "MDH", "MDH Garam Masala", "100 g", 90, 48, "spice", "6291103750167", "off:629/110/375/0167/front_en.5.200.jpg"],

    // Everest
    ["eve01", "everest", "Everest", "Everest Tikhalal Chilli Powder", "100 g", 55, 48, "spice", "8901786392018", "off:890/178/639/2018/front_en.4.200.jpg"],
    ["eve02", "everest", "Everest", "Everest Kitchen King", "100 g", 85, 48, "spice", "8901786121007", "off:890/178/612/1007/front_en.3.200.jpg"],
    ["eve04", "everest", "Everest", "Everest Pav Bhaji Masala", "100 g", 80, 48, "spice", "8901786070503", "off:890/178/607/0503/front_en.5.200.jpg"],
    ["eve05", "everest", "Everest", "Everest Garam Masala", "100 g", 85, 48, "spice", "8901786101009", "off:890/178/610/1009/front_en.3.200.jpg"],

    // Bisleri
    ["bis01", "bisleri", "Bisleri", "Bisleri Water", "500 ml", 10, 24, "water", "8906017290026", "off:890/601/729/0026/front_en.23.200.jpg"],
    ["bis02", "bisleri", "Bisleri", "Bisleri Water", "1 L", 20, 12, "water", "8906017290026", "off:890/601/729/0026/front_en.23.200.jpg"],
    ["bis03", "bisleri", "Bisleri", "Bisleri Water", "2 L", 30, 9, "water", "8906017290026", "off:890/601/729/0026/front_en.23.200.jpg"],

    // Mother Dairy
    ["mdy01", "mdairy", "Dhara", "Dhara Kachi Ghani Mustard Oil", "1 L", 165, 12, "oil", "8906004620256", "off:890/600/462/0256/front_en.3.200.jpg"],
    ["mdy02", "mdairy", "Mother Dairy", "Mother Dairy Cow Ghee", "1 L", 600, 12, "dairy", "8901648031147", "off:890/164/803/1147/front_en.4.200.jpg"],

    // Kellogg's
    ["kel01", "kelloggs", "Kellogg's", "Kellogg's Corn Flakes", "475 g", 185, 16, "cereal", "6154000101022", "off:615/400/010/1022/front_en.10.200.jpg"],
    ["kel02", "kelloggs", "Kellogg's", "Kellogg's Chocos", "375 g", 190, 16, "cereal", "8901499006936", "off:890/149/900/6936/front_en.6.200.jpg"],
    ["kel03", "kelloggs", "Kellogg's", "Kellogg's Chocos", "₹10 pack", 10, 60, "cereal", "8901499006936", "off:890/149/900/6936/front_en.6.200.jpg"],

    // Shree Renuka (Madhur)
    ["ren01", "renuka", "Madhur", "Madhur Pure Sugar", "1 kg", 55, 25, "sugar", "8906026900046", "off:890/602/690/0046/front_en.3.200.jpg"],
    ["ren02", "renuka", "Madhur", "Madhur Pure Sugar", "5 kg", 270, 4, "sugar", "8906026900046", "off:890/602/690/0046/front_en.3.200.jpg"],
  ];

  /* [id, category, English name, Hindi name, sold per, picture]
     sold per: kg · dozen · tray30 · bunch · piece · litre · pack */
  const loose = [
    ["veg01", "veg", "Potato", "आलू", "kg", "🥔"],
    ["veg02", "veg", "Onion", "प्याज़", "kg", "🧅"],
    ["veg03", "veg", "Tomato", "टमाटर", "kg", "🍅"],
    ["veg04", "veg", "Garlic", "लहसुन", "kg", "🧄"],
    ["veg05", "veg", "Ginger", "अदरक", "kg", "🫚"],
    ["veg06", "veg", "Green chilli", "हरी मिर्च", "kg", "🌶️"],
    ["veg07", "veg", "Carrot", "गाजर", "kg", "🥕"],
    ["veg08", "veg", "Cauliflower", "फूलगोभी", "kg", "🥦"],
    ["veg09", "veg", "Cabbage", "पत्ता गोभी", "kg", "🥬"],
    ["veg10", "veg", "Brinjal", "बैंगन", "kg", "🍆"],
    ["veg11", "veg", "Cucumber", "खीरा", "kg", "🥒"],
    ["veg12", "veg", "Capsicum", "शिमला मिर्च", "kg", "🫑"],
    ["veg13", "veg", "Lady finger (bhindi)", "भिंडी", "kg", "🫛"],
    ["veg14", "veg", "Green peas", "हरी मटर", "kg", "🫛"],
    ["veg15", "veg", "Bottle gourd (lauki)", "लौकी", "kg", "🥒"],
    ["veg16", "veg", "Spinach (palak)", "पालक", "bunch", "🥬"],
    ["veg17", "veg", "Coriander (dhania)", "हरा धनिया", "bunch", "🌿"],
    ["veg18", "veg", "Lemon", "नींबू", "kg", "🍋"],
    ["veg19", "veg", "Sweet corn", "भुट्टा", "piece", "🌽"],
    ["veg20", "veg", "Mushroom", "मशरूम", "pack", "🍄"],
    ["fru01", "fruit", "Banana", "केला", "dozen", "🍌"],
    ["fru02", "fruit", "Apple", "सेब", "kg", "🍎"],
    ["fru03", "fruit", "Orange", "संतरा", "kg", "🍊"],
    ["fru04", "fruit", "Mango", "आम", "kg", "🥭"],
    ["fru05", "fruit", "Grapes", "अंगूर", "kg", "🍇"],
    ["fru06", "fruit", "Papaya", "पपीता", "kg", "🍈"],
    ["fru07", "fruit", "Guava", "अमरूद", "kg", "🍐"],
    ["fru08", "fruit", "Watermelon", "तरबूज़", "kg", "🍉"],
    ["fru09", "fruit", "Pineapple", "अनानास", "piece", "🍍"],
    ["fru10", "fruit", "Coconut", "नारियल", "piece", "🥥"],
    ["egg01", "eggs", "Eggs, tray of 30", "अंडे, 30 की ट्रे", "tray30", "🥚"],
    ["egg02", "eggs", "Eggs, dozen", "अंडे, दर्जन", "dozen", "🥚"],
    ["mea01", "meat", "Chicken (with skin)", "चिकन", "kg", "🍗"],
    ["mea02", "meat", "Chicken boneless", "बोनलेस चिकन", "kg", "🍗"],
    ["mea03", "meat", "Mutton", "मटन", "kg", "🥩"],
    ["mea04", "meat", "Fish (rohu)", "मछली (रोहू)", "kg", "🐟"],
    ["mea05", "meat", "Prawns", "झींगा", "kg", "🦐"],
    ["dai01", "milk", "Loose milk", "खुला दूध", "litre", "🥛"],
    ["dai02", "freshdairy", "Paneer", "पनीर", "kg", "🧀"],
    ["dai03", "freshdairy", "Curd (dahi)", "दही", "kg", "🥣"],
    ["grn01", "grains", "Rice (loose)", "खुला चावल", "kg", "🍚"],
    ["grn02", "grains", "Wheat", "गेहूँ", "kg", "🌾"],
    ["grn03", "grains", "Toor dal", "अरहर दाल", "kg", "🫘"],
    ["grn04", "grains", "Moong dal", "मूंग दाल", "kg", "🫘"],
    ["grn05", "grains", "Chana dal", "चना दाल", "kg", "🫘"],
    ["grn06", "grains", "Masoor dal", "मसूर दाल", "kg", "🫘"],
    ["grn07", "grains", "Kabuli chana", "काबुली चना", "kg", "🫘"],
    ["grn08", "grains", "Poha", "पोहा", "kg", "🍚"],
    ["dry01", "dryfruit", "Almonds", "बादाम", "kg", "🌰"],
    ["dry02", "dryfruit", "Cashews", "काजू", "kg", "🥜"],
    ["dry03", "dryfruit", "Raisins", "किशमिश", "kg", "🍇"],
    ["dry04", "dryfruit", "Peanuts", "मूंगफली", "kg", "🥜"],
  ];

  /* REAL PHOTOS FOR LOOSE GOODS (26 Sep 2026, owner: "use real images here too").
     From Wikimedia Commons, each picked and checked by eye as the thing itself
     (no drawings, plants in a field or cooked dishes); only free licences
     (public domain, CC0, CC BY, CC BY-SA; no GFDL-only). Toor dal shows yellow
     split peas, which look the same: Commons has no clean toor dal photo.
     The emoji stays as the fallback when a photo cannot load.
     [path under commons/thumb, licence, author, file name] */
  const FRESH = {
    veg01: ["a/ab/Patates.jpg/330px-Patates.jpg", "Public domain", "Scott Bauer, USDA ARS", "Patates.jpg"],
    veg02: ["a/a2/Mixed_onions.jpg/330px-Mixed_onions.jpg", "CC BY-SA 3.0", "Colin", "Mixed onions.jpg"],
    veg03: ["8/89/Tomato_je.jpg/330px-Tomato_je.jpg", "CC BY-SA 3.0", "Softeis", "Tomato je.jpg"],
    veg04: ["6/61/Garlic_Bulbs_%28Unsplash%29.jpg/330px-Garlic_Bulbs_%28Unsplash%29.jpg", "CC0", "Matthew Pilachowski", "Garlic Bulbs (Unsplash).jpg"],
    veg05: ["3/3d/Ginger_rhizome.jpg/330px-Ginger_rhizome.jpg", "CC BY-SA 4.0", "Mk2010", "Ginger rhizome.jpg"],
    veg06: ["a/ae/Green_chillies_variety.jpg/330px-Green_chillies_variety.jpg", "CC BY-SA 4.0", "Medhi jyoti", "Green chillies variety.jpg"],
    veg07: ["a/a2/Vegetable-Carrot-Bundle-wStalks.jpg/330px-Vegetable-Carrot-Bundle-wStalks.jpg", "Public domain", "Evan-Amos", "Vegetable-Carrot-Bundle-wStalks.jpg"],
    veg08: ["2/2f/Chou-fleur_02.jpg/330px-Chou-fleur_02.jpg", "CC BY-SA 3.0", "Coyau", "Chou-fleur 02.jpg"],
    veg09: ["5/52/Cabbage_on_farm.jpg/330px-Cabbage_on_farm.jpg", "CC BY-SA 4.0", "Yusuf Muhammed Thanni", "Cabbage on farm.jpg"],
    veg10: ["7/76/Solanum_melongena_24_08_2012_%281%29.JPG/330px-Solanum_melongena_24_08_2012_%281%29.JPG", "CC BY-SA 3.0", "Joydeep", "Solanum melongena 24 08 2012 (1).JPG"],
    veg11: ["4/4d/Cucumbers_harvesting.jpg/330px-Cucumbers_harvesting.jpg", "CC BY-SA 4.0", "Shark2025", "Cucumbers harvesting.jpg"],
    veg12: ["8/85/Green-Yellow-Red-Pepper-2009.jpg/330px-Green-Yellow-Red-Pepper-2009.jpg", "CC BY-SA 3.0", "Kham Tran", "Green-Yellow-Red-Pepper-2009.jpg"],
    veg13: ["5/54/Quiabo.jpg/330px-Quiabo.jpg", "CC0", "ArionStar", "Quiabo.jpg"],
    veg14: ["1/11/Peas_in_pods_-_Studio.jpg/330px-Peas_in_pods_-_Studio.jpg", "CC BY-SA 3.0", "Bill Ebbesen", "Peas in pods - Studio.jpg"],
    veg15: ["7/7f/Rythu_Vegetables_market%2C_Hyderabad_07.jpg/330px-Rythu_Vegetables_market%2C_Hyderabad_07.jpg", "CC0", "Rajasekhar1961", "Rythu Vegetables market, Hyderabad 07.jpg"],
    veg16: ["5/56/Fresh_Spinach_leaves.jpg/330px-Fresh_Spinach_leaves.jpg", "CC BY-SA 4.0", "Charipearl", "Fresh Spinach leaves.jpg"],
    veg17: ["b/b7/Bunches_of_coriander_leaves.jpg/330px-Bunches_of_coriander_leaves.jpg", "CC BY-SA 4.0", "Kpsudeep", "Bunches of coriander leaves.jpg"],
    veg18: ["e/e4/Lemon.jpg/330px-Lemon.jpg", "CC BY-SA 2.5", "André Karwath aka Aka", "Lemon.jpg"],
    veg19: ["3/30/Iba%2CZambalesjf9268_12.JPG/330px-Iba%2CZambalesjf9268_12.JPG", "CC BY-SA 3.0", "Ramon FVelasquez", "Iba,Zambalesjf9268 12.JPG"],
    veg20: ["0/01/ChampignonMushroom.jpg/330px-ChampignonMushroom.jpg", "CC BY-SA 3.0", "chris_73", "ChampignonMushroom.jpg"],
    fru01: ["d/de/Bananavarieties.jpg/330px-Bananavarieties.jpg", "CC BY-SA 3.0", "TimothyPilgrim", "Bananavarieties.jpg"],
    fru02: ["1/15/Red_Apple.jpg/330px-Red_Apple.jpg", "CC BY 2.0", "Abhijit Tembhekar", "Red Apple.jpg"],
    fru03: ["e/e3/Oranges_-_whole-halved-segment.jpg/330px-Oranges_-_whole-halved-segment.jpg", "CC BY-SA 4.0", "Ivar Leidus", "Oranges - whole-halved-segment.jpg"],
    fru04: ["7/74/Mangos_-_single_and_halved.jpg/330px-Mangos_-_single_and_halved.jpg", "CC BY-SA 4.0", "Ivar Leidus", "Mangos - single and halved.jpg"],
    fru05: ["5/53/Grapes%2C_Rostov-on-Don%2C_Russia.jpg/330px-Grapes%2C_Rostov-on-Don%2C_Russia.jpg", "CC BY 4.0", "Vyacheslav Argenberg", "Grapes, Rostov-on-Don, Russia.jpg"],
    fru06: ["c/c0/Papaya_cut_half.jpg/330px-Papaya_cut_half.jpg", "CC BY-SA 4.0", "Maksym Kozlenko", "Papaya cut half.jpg"],
    fru07: ["8/88/Guava_pink_fruit.jpg/330px-Guava_pink_fruit.jpg", "CC BY-SA 4.0", "Ivar Leidus", "Guava pink fruit.jpg"],
    fru08: ["4/47/Taiwan_2009_Tainan_City_Organic_Farm_Watermelon_FRD_7962.jpg/330px-Taiwan_2009_Tainan_City_Organic_Farm_Watermelon_FRD_7962.jpg", "CC BY-SA 3.0", "Fred Hsu", "Taiwan 2009 Tainan City Organic Farm Watermelon FRD 7962.jpg"],
    fru09: ["7/74/%E0%B4%95%E0%B5%88%E0%B4%A4%E0%B4%9A%E0%B5%8D%E0%B4%9A%E0%B4%95%E0%B5%8D%E0%B4%95.jpg/330px-%E0%B4%95%E0%B5%88%E0%B4%A4%E0%B4%9A%E0%B5%8D%E0%B4%9A%E0%B4%95%E0%B5%8D%E0%B4%95.jpg", "CC BY 3.0", "Suniltg at Malayalam Wikipedia", "കൈതച്ചക്ക.jpg"],
    fru10: ["e/e1/-365_coconut_husk_%2828072494014%29.jpg/330px--365_coconut_husk_%2828072494014%29.jpg", "CC BY 2.0", "terri_bateman", "-365 coconut husk (28072494014).jpg"],
    egg01: ["7/7b/Egg_trays_%28Landmarks%3B_2023-08-12%29_E911a_09.jpg/330px-Egg_trays_%28Landmarks%3B_2023-08-12%29_E911a_09.jpg", "CC BY-SA 4.0", "E911a", "Egg trays (Landmarks; 2023-08-12) E911a 09.jpg"],
    egg02: ["5/56/Eierdoosmet10eierengevuld2010.jpg/330px-Eierdoosmet10eierengevuld2010.jpg", "Public domain", "Ischa1", "Eierdoosmet10eierengevuld2010.jpg"],
    mea01: ["c/c7/Raw_chicken_for_sale.jpg/330px-Raw_chicken_for_sale.jpg", "CC BY-SA 3.0", "ProjectManhattan", "Raw chicken for sale.jpg"],
    mea02: ["4/4e/Raw_chicken_thighs.jpg/330px-Raw_chicken_thighs.jpg", "CC BY 3.0", "gran", "Raw chicken thighs.jpg"],
    mea03: ["3/38/Raw_lamb_cutlets_with_shredded_ginger_and_rosemary.jpg/330px-Raw_lamb_cutlets_with_shredded_ginger_and_rosemary.jpg", "CC BY-SA 3.0", "Salimfadhley", "Raw lamb cutlets with shredded ginger and rosemary.jpg"],
    mea04: ["e/e0/Rohu_at_Giant_Hypermarket_Kota_Damansara_20230203_105829.jpg/330px-Rohu_at_Giant_Hypermarket_Kota_Damansara_20230203_105829.jpg", "CC0", "Wiki Farazi", "Rohu at Giant Hypermarket Kota Damansara 20230203 105829.jpg"],
    mea05: ["9/98/Penaeus_monodon.jpg/330px-Penaeus_monodon.jpg", "CC BY-SA 3.0", "", "Penaeus monodon.jpg"],
    dai01: ["a/a5/Glass_of_Milk_%2833657535532%29.jpg/330px-Glass_of_Milk_%2833657535532%29.jpg", "CC BY 2.0", "NIAID", "Glass of Milk (33657535532).jpg"],
    dai02: ["3/36/Panir_Paneer_Indian_cheese_fresh.jpg/330px-Panir_Paneer_Indian_cheese_fresh.jpg", "CC BY 2.0 de", "Sonja Pauen", "Panir Paneer Indian cheese fresh.jpg"],
    dai03: ["4/45/Curd_in_a_traditional_Manipuri_earthen_pot.JPG/330px-Curd_in_a_traditional_Manipuri_earthen_pot.JPG", "CC BY-SA 4.0", "Goumisao", "Curd in a traditional Manipuri earthen pot.JPG"],
    grn01: ["f/f8/Basmati_Rice_India%2C_raw.jpg/330px-Basmati_Rice_India%2C_raw.jpg", "CC BY 2.0", "cookbookman17", "Basmati Rice India, raw.jpg"],
    grn02: ["b/b4/Wheat_close-up.JPG/330px-Wheat_close-up.JPG", "CC BY-SA 3.0", "Bluemoose", "Wheat close-up.JPG"],
    grn03: ["9/90/Goya_yellow_split_peas.jpg/330px-Goya_yellow_split_peas.jpg", "CC0", "Mx. Granger", "Goya yellow split peas.jpg"],
    grn04: ["2/2a/Moong_Dal.jpg/330px-Moong_Dal.jpg", "CC BY-SA 3.0", "Sudeshna Banerjee", "Moong Dal.jpg"],
    grn05: ["7/7a/Chana_Ko_Dal.jpg/330px-Chana_Ko_Dal.jpg", "CC BY-SA 4.0", "Gaurav Dhwaj Khadka", "Chana Ko Dal.jpg"],
    grn06: ["3/38/Masoor_dal.JPG/330px-Masoor_dal.JPG", "CC BY-SA 2.5", "Rydia", "Masoor dal.JPG"],
    grn07: ["d/d9/Ordinary_chickpeas_in_a_ceramic_bowl.jpg/330px-Ordinary_chickpeas_in_a_ceramic_bowl.jpg", "CC BY-SA 4.0", "AlixSaz", "Ordinary chickpeas in a ceramic bowl.jpg"],
    grn08: ["8/80/Poha.jpg/330px-Poha.jpg", "CC BY-SA 3.0", "Sanjay Acharya", "Poha.jpg"],
    dry01: ["3/37/Almonds_-_in_shell%2C_shell_cracked_open%2C_shelled%2C_blanched.jpg/330px-Almonds_-_in_shell%2C_shell_cracked_open%2C_shelled%2C_blanched.jpg", "CC BY-SA 4.0", "Ivar Leidus", "Almonds - in shell, shell cracked open, shelled, blanched.jpg"],
    dry02: ["3/3c/Roasted_peeled_cashews.jpg/330px-Roasted_peeled_cashews.jpg", "CC0", "Fumikas Sagisavas", "Roasted peeled cashews.jpg"],
    dry03: ["7/7d/Raisins_01.jpg/330px-Raisins_01.jpg", "CC BY-SA 3.0", "Paweł Kuźniar", "Raisins 01.jpg"],
    dry04: ["3/36/Roasted_Peanuts_with_shell.jpg/330px-Roasted_Peanuts_with_shell.jpg", "CC BY-SA 4.0", "Sanjay Acharya", "Roasted Peanuts with shell.jpg"],
  };

  /* The aisles of a shop: how "by type" is laid out. Fresh first. Every
     category that has items sits in exactly one aisle. */
  const aisles = [
    { id: "veg", rep: "veg03", en: "Vegetables", hi: "सब्ज़ी", icon: "🥕", cats: ["veg"], fresh: true },
    { id: "fruit", rep: "fru02", en: "Fruits", hi: "फल", icon: "🍎", cats: ["fruit"], fresh: true },
    { id: "eggs", rep: "egg02", en: "Eggs", hi: "अंडे", icon: "🥚", cats: ["eggs"], fresh: true },
    { id: "meat", rep: "mea01", en: "Chicken, meat & fish", hi: "चिकन, मटन, मछली", icon: "🍗", cats: ["meat"], fresh: true },
    { id: "milk", rep: "dai01", en: "Milk, paneer & cheese", hi: "दूध, पनीर, दही, चीज़", icon: "🥛", cats: ["milk", "freshdairy", "milkpowder", "cheese"], fresh: true },
    { id: "staples", en: "Atta, rice & dal", hi: "आटा, चावल, दाल", icon: "🌾", cats: ["atta", "grains", "dal"] },
    { id: "oil", en: "Oil, ghee & butter", hi: "तेल, घी, मक्खन", icon: "🛢️", cats: ["oil", "dairy"] },
    { id: "sugar", en: "Sugar & salt", hi: "चीनी, नमक", icon: "🧂", cats: ["sugar", "salt"] },
    { id: "spice", en: "Spices & masala", hi: "मसाले", icon: "🌶️", cats: ["spice"] },
    { id: "dryfruit", en: "Dry fruits", hi: "सूखे मेवे", icon: "🥜", cats: ["dryfruit"] },
    { id: "tea", en: "Tea & coffee", hi: "चाय, कॉफ़ी", icon: "🍵", cats: ["tea", "coffee"] },
    { id: "biscuit", en: "Biscuits & cakes", hi: "बिस्किट, केक", icon: "🍪", cats: ["biscuit"] },
    { id: "snacks", en: "Namkeen & chips", hi: "नमकीन, चिप्स", icon: "🥨", cats: ["namkeen", "chips"] },
    { id: "choco", en: "Chocolates & sweets", hi: "चॉकलेट, टॉफ़ी", icon: "🍫", cats: ["choco", "sweets"] },
    { id: "breakfast", en: "Noodles, sauces & breakfast", hi: "नूडल्स, सॉस, नाश्ता", icon: "🍜", cats: ["noodles", "ready", "sauce", "jam", "cereal"] },
    { id: "drinks", en: "Cold drinks, juice & water", hi: "कोल्ड ड्रिंक, जूस, पानी", icon: "🥤", cats: ["softdrink", "juice", "water"] },
    { id: "health", en: "Health drinks & baby food", hi: "हेल्थ ड्रिंक, बेबी फ़ूड", icon: "🍼", cats: ["healthdrink", "babyfood"] },
  ];

  const items = rows.map(function (r) {
    const p = r[9].split(":");
    return { id: r[0], company: r[1], brand: r[2], name: r[3], pack: r[4], mrp: r[5], caseQty: r[6], cat: r[7], barcode: r[8], img: PHOTO[p[0]] + p.slice(1).join(":") };
  }).concat(loose.map(function (r) {
    const f = FRESH[r[0]];
    return { id: r[0], company: "", brand: "", name: r[2], hi: r[3], pack: r[4], per: r[4], mrp: null, caseQty: 1, cat: r[1], barcode: "", img: f ? WM + f[0] : null, emoji: r[5], loose: true };
  }));

  const catalogue = {
    version: "2026-09-26e",
    note: "MRPs are indicative (check on pack). GST by category under the GST 2.0 slabs from 22 Sep 2025; confirm with your accountant.",
    credit: "Product photos: Open Food Facts, Open Beauty Facts, Open Products Facts contributors (CC BY-SA). Fresh produce photos: Wikimedia Commons contributors (public domain, CC0, CC BY, CC BY-SA; each author in the file).",
    freshCredits: Object.keys(FRESH).map(function (id) {
      const f = FRESH[id];
      return { id: id, file: f[3], author: f[2], licence: f[1], page: "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(f[3].replace(/ /g, "_")) };
    }),
    categories: categories,
    companies: companies,
    aisles: aisles,
    items: items,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = catalogue;
  else root.FB_CATALOGUE = catalogue;
})(typeof window !== "undefined" ? window : globalThis);

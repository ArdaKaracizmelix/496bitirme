"""
Curated Turkey city knowledge for Excursa Assistant.

This module intentionally keeps a deterministic city/province layer outside the
LLM. The entries are concise, sourceable public travel/gastronomy knowledge and
are meant to be expanded over time without touching chatbot logic.
"""

PROVINCE_NAMES = [
    "Adana", "Adiyaman", "Afyonkarahisar", "Agri", "Aksaray", "Amasya",
    "Ankara", "Antalya", "Ardahan", "Artvin", "Aydin", "Balikesir",
    "Bartin", "Batman", "Bayburt", "Bilecik", "Bingol", "Bitlis",
    "Bolu", "Burdur", "Bursa", "Canakkale", "Cankiri", "Corum",
    "Denizli", "Diyarbakir", "Duzce", "Edirne", "Elazig", "Erzincan",
    "Erzurum", "Eskisehir", "Gaziantep", "Giresun", "Gumushane",
    "Hakkari", "Hatay", "Igdir", "Isparta", "Istanbul", "Izmir",
    "Kahramanmaras", "Karabuk", "Karaman", "Kars", "Kastamonu",
    "Kayseri", "Kirikkale", "Kirklareli", "Kirsehir", "Kilis", "Kocaeli",
    "Konya", "Kutahya", "Malatya", "Manisa", "Mardin", "Mersin",
    "Mugla", "Mus", "Nevsehir", "Nigde", "Ordu", "Osmaniye", "Rize",
    "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Sanliurfa",
    "Sirnak", "Tekirdag", "Tokat", "Trabzon", "Tunceli", "Usak",
    "Van", "Yalova", "Yozgat", "Zonguldak",
]

PROVINCE_ALIASES = {
    "Adiyaman": ["adiyaman", "nemrut"],
    "Afyonkarahisar": ["afyon", "afyonkarahisar"],
    "Agri": ["agri", "dogubayazit", "ishak pasa"],
    "Aksaray": ["aksaray", "ihlara"],
    "Amasya": ["amasya"],
    "Canakkale": ["canakkale", "troya", "bozcaada", "gokceada"],
    "Cankiri": ["cankiri"],
    "Corum": ["corum", "hattusa", "hattuşa"],
    "Diyarbakir": ["diyarbakir", "sur"],
    "Duzce": ["duzce", "akçakoca", "akcakoca"],
    "Elazig": ["elazig", "harput"],
    "Erzincan": ["erzincan"],
    "Eskisehir": ["eskisehir", "odunpazari"],
    "Gaziantep": ["gaziantep", "antep"],
    "Gumushane": ["gumushane"],
    "Igdir": ["igdir"],
    "Istanbul": ["istanbul", "sultanahmet", "galata", "kadikoy", "karakoy"],
    "Izmir": ["izmir", "efes", "cesme", "alsancak"],
    "Kahramanmaras": ["kahramanmaras", "maras"],
    "Kirikkale": ["kirikkale"],
    "Kirklareli": ["kirklareli"],
    "Kirsehir": ["kirsehir"],
    "Kutahya": ["kutahya"],
    "Mugla": ["mugla", "bodrum", "fethiye", "marmaris", "datca"],
    "Mus": ["mus"],
    "Nevsehir": ["nevsehir", "kapadokya", "cappadocia", "goreme", "urgup"],
    "Nigde": ["nigde"],
    "Sanliurfa": ["sanliurfa", "sanli urfa", "urfa", "gobeklitepe", "balikligol"],
    "Sirnak": ["sirnak"],
}

FOODS = {
    "Adana": ["Adana kebabi", "salgam", "bici bici", "analı kizli", "sirdan"],
    "Adiyaman": ["cig kofte", "besni tava", "hitap", "peynirli helva"],
    "Afyonkarahisar": ["sucuk", "kaymak", "Afyon lokumu", "bükme", "keskek"],
    "Agri": ["abdigor koftesi", "goşteberg et", "hasude", "ayran asi"],
    "Aksaray": ["soganlama", "bamya corbasi", "aksaray tava", "incelek tatlisi"],
    "Amasya": ["Amasya coregi", "bakla dolmasi", "kesme ibik corbasi", "elma tatlisi"],
    "Ankara": ["Ankara tava", "beypazari kurusu", "inceğiz corbasi", "bazlama kebabi"],
    "Antalya": ["piyaz", "hibes", "kabak cicegi dolmasi", "bergamot receli"],
    "Ardahan": ["kaz eti", "evelik asi", "feselli", "katmer"],
    "Artvin": ["hamsili pilav", "kuymak", "kaygana", "puhuruk corbasi"],
    "Aydin": ["keskek", "cigirtma", "yuvarlama", "incir tatlisi"],
    "Balikesir": ["hosmerim", "susurluk ayrani", "tirit", "manyas peyniri"],
    "Bartin": ["pumpum corbasi", "pirinc mantisi", "halisga", "incir dondurmasi"],
    "Batman": ["perde pilavi", "kaburga dolmasi", "icli kofte", "samborek"],
    "Bayburt": ["galacos", "lor dolmasi", "tatli corba", "tel helvasi"],
    "Bilecik": ["Bilecik guveci", "nohutlu mantı", "boza", "keskek"],
    "Bingol": ["sorina pel", "mastuva", "keldoş", "gömme"],
    "Bitlis": ["burok", "avşor", "katikli dolma", "ciğer taplamasi"],
    "Bolu": ["mengen pilavi", "kedi batmaz", "kabakli gozleme", "kaldirik dolmasi"],
    "Burdur": ["Burdur sis", "ceviz ezmesi", "testi kebabi", "kabak helvasi"],
    "Bursa": ["Iskender kebap", "Inegol kofte", "kestane sekeri", "cantik"],
    "Canakkale": ["peynir helvasi", "ovmaç corbasi", "tumbi", "sardalya"],
    "Cankiri": ["yaren guveci", "tutmac corbasi", "cizlama", "ince ekmek muskasi"],
    "Corum": ["Corum leblebisi", "iskilip dolmasi", "hingal", "yanic"],
    "Denizli": ["Denizli kebabi", "caput asi", "katmer", "tandir"],
    "Diyarbakir": ["kaburga dolmasi", "meftune", "nardan asi", "burma kadayif"],
    "Duzce": ["Duzce koftesi", "mancarlı pide", "melenguccegi tatlisi", "akçakoca balik"],
    "Edirne": ["tava ciger", "badem ezmesi", "kavala kurabiyesi", "ciğer sarma"],
    "Elazig": ["harput koftesi", "orcik", "sırın", "lobik corbasi"],
    "Erzincan": ["Erzincan tulum peyniri", "kesme corbasi", "gasefe", "babikko"],
    "Erzurum": ["cag kebabi", "kadayıf dolmasi", "ayran asi", "civil peynir"],
    "Eskisehir": ["ciborek", "balaban kebabi", "met helvasi", "boza"],
    "Gaziantep": ["baklava", "beyran", "katmer", "lahmacun", "yuvalama"],
    "Giresun": ["findik", "karalahana diblesi", "mısır ekmegi", "hamsi"],
    "Gumushane": ["pestil", "kome", "siron", "lemis"],
    "Hakkari": ["doğaba", "kiriş", "keledoş", "otlu peynir"],
    "Hatay": ["kunefe", "tepsi kebabi", "humus", "oruk", "kaytaz boregi"],
    "Igdir": ["bozbas", "tas kofte", "katlet", "kaysefe"],
    "Isparta": ["kabune pilavi", "fırın kebabi", "gül receli", "nokul"],
    "Istanbul": ["balik ekmek", "sariyer boregi", "kanlica yogurt", "sultanahmet köfte"],
    "Izmir": ["boyoz", "kumru", "gevrek", "lokma", "söğüş"],
    "Kahramanmaras": ["Maras dondurmasi", "tarhana", "eli bogrunde", "mumbar"],
    "Karabuk": ["peruhi", "bandirma", "safranbolu lokumu", "cevizli yayim"],
    "Karaman": ["calla", "batirik", "arabaşı corbasi", "divle obruk peyniri"],
    "Kars": ["kaz eti", "gravyer", "hangel", "umaç helvasi"],
    "Kastamonu": ["etli ekmek", "banduma", "cekme helva", "siyez bulguru"],
    "Kayseri": ["mantı", "pastirma", "sucuk", "yaglama", "nevzine"],
    "Kirikkale": ["keskin tava", "sızgıt", "un tarhanasi", "bazlama"],
    "Kirklareli": ["hardaliye", "kivircik kuzu", "papara", "pekmezli kaçamak"],
    "Kirsehir": ["çullama", "besmeç", "düğün corbasi", "höşmerim"],
    "Kilis": ["kilis tava", "oruk", "cennet camuru", "lebeniye"],
    "Kocaeli": ["pismaniye", "kandıra yogurdu", "mancarlı pide", "höşmerim"],
    "Konya": ["etli ekmek", "firin kebabi", "bamya corbasi", "sacarasi"],
    "Kutahya": ["cimcik", "sıkıcık corbasi", "gökçümen hamursuzu", "tosunum"],
    "Malatya": ["kayisi", "analı kızlı", "kiraz yapragi sarmasi", "kağıt kebabi"],
    "Manisa": ["mesir macunu", "Manisa kebabi", "odun koftesi", "sinkonta"],
    "Mardin": ["kaburga dolmasi", "sembusek", "ikbebet", "harire tatlisi"],
    "Mersin": ["tantuni", "cezerye", "kerebic", "batirik"],
    "Mugla": ["çökertme kebabi", "kabak cicegi dolmasi", "börülce", "tarhana"],
    "Mus": ["helese", "corti", "jağ", "keşkek"],
    "Nevsehir": ["testi kebabi", "düğü corbasi", "dolaz", "köftür"],
    "Nigde": ["Niğde tava", "mazakli koftesi", "soganlama", "köfter"],
    "Ordu": ["pancar corbasi", "melocan kavurmasi", "hamsi tava", "findikli burma"],
    "Osmaniye": ["fıstıklı kömbe", "tirşik", "topalak", "bayram kömbesi"],
    "Rize": ["muhlama", "laz boregi", "hamsili pilav", "Rize kavurmasi"],
    "Sakarya": ["ıslama kofte", "kabak tatlisi", "dartili keşkek", "mancarlı pide"],
    "Samsun": ["Bafra pidesi", "kaz tiridi", "nokul", "tirit"],
    "Siirt": ["büryan kebabi", "perde pilavi", "kitel", "varak kek"],
    "Sinop": ["Sinop mantisi", "nokul", "katlama", "mısır corbasi"],
    "Sivas": ["Sivas köftesi", "madımak", "hingel", "peskutan corbasi"],
    "Sanliurfa": ["cig kofte", "Urfa kebabi", "lahmacun", "borani", "menengic kahvesi"],
    "Sirnak": ["perde pilavi", "kutlik", "serbidev", "mehir"],
    "Tekirdag": ["Tekirdag koftesi", "peynir helvasi", "Hayrabolu tatlisi", "cizleme"],
    "Tokat": ["Tokat kebabi", "bat", "yaprak sarmasi", "cevizli çörek"],
    "Trabzon": ["kuymak", "Akcaabat koftesi", "hamsi", "laz boregi"],
    "Tunceli": ["zerfet", "sir", "gulik", "babuko"],
    "Usak": ["tarhana corbasi", "cendere tatlisi", "döndürme böreği", "keşkek"],
    "Van": ["Van kahvaltisi", "otlu peynir", "murtuga", "kavut"],
    "Yalova": ["Yalova sütlüsü", "termal tatlar", "yaprak pidesi", "köy ürünleri"],
    "Yozgat": ["arabaşı", "testi kebabi", "madımak", "parmak çörek"],
    "Zonguldak": ["devrek simidi", "pumpum corbasi", "malay", "cevizli dolma"],
}

DEFAULT_PLACES = {
    "history": ["Kent Muzesi", "Tarihi Carsi", "Eski Kent Merkezi"],
    "nature": ["Kent Parki", "Yakindaki yayla veya tabiat parki", "Seyir noktasi"],
    "place": ["Kent merkezi", "Yerel pazar", "Sahil veya yuruyus aksı"],
}

PLACES = {
    "Adana": [
        ("Taskopru", "history", "Roma donemine uzanan tarihi kopru ve sehir simgesi."),
        ("Sabanci Merkez Camii", "history", "Seyhan kiyisinda etkileyici modern dini mimari."),
        ("Adana Arkeoloji Muzesi", "history", "Cukurova tarihini anlamak icin guclu muze."),
        ("Kazancilar Carsisi", "food", "Yerel lezzet ve tarihi carsi atmosferi."),
        ("Seyhan Baraj Golu", "nature", "Manzara ve sakin mola icin iyi."),
        ("Varda Koprusu", "history", "Demiryolu mirasi ve vadi manzarasi."),
    ],
    "Ankara": [
        ("Anitkabir", "history", "Cumhuriyet hafizasinin en guclu duraklarindan."),
        ("Anadolu Medeniyetleri Muzesi", "history", "Anadolu uygarliklarini kronolojik anlatan onemli muze."),
        ("Ankara Kalesi", "history", "Eski Ankara dokusu ve manzara bir arada."),
        ("Hamamonu", "history", "Restore tarihi evler ve yuruyus akslari."),
        ("Kugulu Park", "nature", "Merkezde kisa yesil mola."),
    ],
    "Antalya": [
        ("Kaleici", "history", "Roma, Selcuklu ve Osmanli izlerini tasiyan tarihi merkez."),
        ("Aspendos Antik Tiyatrosu", "history", "Anadolu'nun en iyi korunmus antik tiyatrolarindan."),
        ("Perge Antik Kenti", "history", "Pamfilya bolgesinin onemli antik kenti."),
        ("Duden Selalesi", "nature", "Sehir icinde guclu dogal durak."),
        ("Konyaalti Sahili", "nature", "Deniz ve Toros manzarasini birlestirir."),
    ],
    "Bursa": [
        ("Ulu Cami", "history", "Erken Osmanli mimarisinin simge yapilarindan."),
        ("Cumalikizik", "history", "Osmanli koy dokusunu koruyan UNESCO alani."),
        ("Tophane", "history", "Sehir manzarasi ve tarih bir arada."),
        ("Uludag", "nature", "Doga, kar ve yayla deneyimi icin ana durak."),
        ("Koza Han", "place", "Ipek ticareti mirasi ve carsi atmosferi."),
    ],
    "Canakkale": [
        ("Troya Antik Kenti", "history", "Mitoloji ve arkeoloji acisindan cok onemli antik alan."),
        ("Gelibolu Tarihi Yarimadasi", "history", "Canakkale Savaslari hafizasinin ana rotasi."),
        ("Assos", "history", "Antik kent ve Ege manzarasi."),
        ("Bozcaada", "place", "Ada sokaklari, deniz ve bag rotasi."),
        ("Gokceada", "nature", "Dogal koylar ve ada kulturunu birlestirir."),
    ],
    "Diyarbakir": [
        ("Diyarbakir Surlari", "history", "UNESCO listesindeki anitsal sur sistemi."),
        ("Hevsel Bahceleri", "nature", "Dicle kiyisinda tarihi tarim peyzaji."),
        ("Ulu Cami", "history", "Anadolu'nun en eski camilerinden biri kabul edilir."),
        ("Hasan Pasa Hani", "place", "Tarihi han ve kahvalti molasi."),
        ("On Gozlu Kopru", "history", "Dicle uzerinde tarihi kopru."),
    ],
    "Edirne": [
        ("Selimiye Camii", "history", "Mimar Sinan'in ustalik eseri olarak bilinir."),
        ("Eski Cami", "history", "Erken Osmanli dini mimarisinin onemli ornegi."),
        ("Meriç Koprusu", "history", "Nehir manzarasi ve tarihi kopru dokusu."),
        ("Karaagac", "place", "Yuruyus, gar binasi ve sakin mahalle atmosferi."),
        ("Sultan II. Bayezid Kulliyesi", "history", "Tıp tarihi ve kulliye mimarisi icin degerli."),
    ],
    "Erzurum": [
        ("Cifte Minareli Medrese", "history", "Selcuklu tas isciliginin guclu ornegi."),
        ("Yakutiye Medresesi", "history", "Tarihi medrese ve kent hafizasi."),
        ("Erzurum Kalesi", "history", "Sehir tarihine hakim bir durak."),
        ("Palandoken", "nature", "Kis sporlari ve dag manzarasi."),
        ("Uc Kumbetler", "history", "Anadolu mezar mimarisinin dikkat cekici ornekleri."),
    ],
    "Gaziantep": [
        ("Zeugma Mozaik Muzesi", "history", "Roma donemi mozaikleriyle dunya capinda onemli muze."),
        ("Gaziantep Kalesi", "history", "Sehir merkezinde tarihi savunma yapisi."),
        ("Bakırcılar Carsisi", "place", "El sanati ve carsi kulturu."),
        ("Emine Gogus Mutfak Muzesi", "food", "Antep gastronomi kulturunu anlamak icin iyi."),
        ("Rumkale", "history", "Firat kiyisinda tarih ve manzara."),
    ],
    "Istanbul": [
        ("Sultanahmet Meydani", "history", "Roma, Bizans ve Osmanli katmanlarini bir arada sunar."),
        ("Topkapi Sarayi", "history", "Osmanli saray yasami ve imparatorluk merkezi."),
        ("Ayasofya", "history", "Bizans ve Osmanli mirasini ayni yapida tasir."),
        ("Galata Kulesi", "history", "Beyoglu hattinda ikonik manzara duragi."),
        ("Balat", "history", "Cok kulturlu mahalle dokusu ve renkli sokaklar."),
        ("Kadikoy Moda", "food", "Yeme icme ve sahil yuruyusu icin guclu alternatif."),
    ],
    "Izmir": [
        ("Efes Antik Kenti", "history", "Antik dunyanin en onemli kentlerinden."),
        ("Kemeraltı Carsisi", "place", "Tarihi carsi ve yerel lezzet aksı."),
        ("Saat Kulesi", "history", "Konak Meydani'nin simgesi."),
        ("Kadifekale", "history", "Sehir manzarasi ve antik kale kalintilari."),
        ("Cesme", "nature", "Deniz, koylar ve yaz rotasi."),
    ],
    "Kayseri": [
        ("Kayseri Kalesi", "history", "Sehir merkezinde tarihi savunma yapisi."),
        ("Gevher Nesibe Muzesi", "history", "Selcuklu tip tarihi icin onemli."),
        ("Erciyes Dagi", "nature", "Kayak, dag ve doga rotasi."),
        ("Kapali Carsi", "place", "Ticaret ve kent kulturu."),
        ("Soganli Vadisi", "history", "Kaya kiliseleri ve vadi dokusu."),
    ],
    "Konya": [
        ("Mevlana Muzesi", "history", "Mevlevilik ve sehir kimliginin merkezi."),
        ("Alaeddin Tepesi", "history", "Selcuklu Konya'sini hissettiren ana durak."),
        ("Sille", "history", "Tarihi yerlesim ve tas sokaklar."),
        ("Catalhoyuk", "history", "Neolitik donem icin dunya capinda onemli alan."),
        ("Tropikal Kelebek Bahcesi", "nature", "Aile ve doga odakli modern durak."),
    ],
    "Mardin": [
        ("Mardin Eski Sehir", "history", "Tas mimari ve Mezopotamya manzarasi."),
        ("Deyrulzafaran Manastiri", "history", "Suryani kultur mirasinin onemli merkezi."),
        ("Zinciriye Medresesi", "history", "Tarihi medrese ve sehir panoramasi."),
        ("Midyat", "history", "Konaklar ve telkari kulturu."),
        ("Dara Antik Kenti", "history", "Roma donemi sinir kenti kalintilari."),
    ],
    "Mugla": [
        ("Bodrum Kalesi", "history", "Denizcilik tarihi ve kale mimarisi."),
        ("Fethiye Oludeniz", "nature", "Turkuaz deniz ve yamaç parasutu rotasi."),
        ("Dalyan Kaunos", "history", "Antik kent ve kaya mezarlari."),
        ("Datca", "nature", "Koylar ve sakin Ege atmosferi."),
        ("Marmaris", "nature", "Koylar, marina ve sahil rotasi."),
    ],
    "Nevsehir": [
        ("Goreme Acik Hava Muzesi", "history", "Kaya oyma kiliseler ve freskleriyle onemli."),
        ("Uchisar Kalesi", "history", "Kapadokya panoramasi icin en iyi noktalardan."),
        ("Derinkuyu Yeralti Sehri", "history", "Cok katli yer alti yasam ve savunma alani."),
        ("Pasabag", "nature", "Peri bacalarini yakindan gormek icin ideal."),
        ("Avanos", "place", "Seramik gelenegi ve Kizilirmak kiyisi."),
    ],
    "Rize": [
        ("Ayder Yaylasi", "nature", "Yayla atmosferi ve dag manzarasi."),
        ("Zilkale", "history", "Firtina Vadisi uzerinde tarihi kale."),
        ("Firtina Deresi", "nature", "Rafting ve vadi deneyimi."),
        ("Pokut Yaylasi", "nature", "Bulut denizi ve yayla manzarasi."),
        ("Rize Kalesi", "history", "Sehir manzarasi ve tarihi durak."),
    ],
    "Samsun": [
        ("Bandirma Vapuru", "history", "Milli Mucadele hafizasi icin temel durak."),
        ("Amisos Tepesi", "history", "Tumulus ve sehir manzarasi."),
        ("Atakum Sahili", "nature", "Sahil yuruyusu ve sosyal aks."),
        ("Kizilirmak Deltasi", "nature", "Kus gozlemi ve dogal yasam alani."),
        ("Gazi Muzesi", "history", "Ataturk ve Samsun tarihi icin onemli."),
    ],
    "Sanliurfa": [
        ("Gobeklitepe", "history", "Insanlik tarihindeki en eski anitsal tapinak alanlarindan biri olarak bilinir."),
        ("Balikligol", "history", "Hz. Ibrahim anlatilariyla sehrin inanc ve kultur kimligini tasir."),
        ("Harran Evleri", "history", "Konik kubbeli geleneksel mimariyi gormek icin ozel bir durak."),
        ("Sanliurfa Arkeoloji Muzesi", "history", "Gobeklitepe ve bolge arkeolojisini anlamak icin guclu muze."),
        ("Gumruk Hani", "food", "Menengic kahvesi ve tarihi han atmosferi icin iyi mola."),
        ("Halfeti", "nature", "Firat manzarasi ve sular altinda kalan eski yerlesim dokusuyla bilinir."),
    ],
    "Trabzon": [
        ("Sumela Manastiri", "history", "Kayalik yamaca kurulu ikonik manastir."),
        ("Uzungol", "nature", "Göl ve dag manzarasi."),
        ("Ataturk Kosku", "history", "Kent hafizasi ve mimari durak."),
        ("Boztepe", "nature", "Sehir manzarasi ve cay molasi."),
        ("Ayasofya Muzesi", "history", "Bizans donemi mimari mirasi."),
    ],
    "Van": [
        ("Akdamar Adasi", "history", "Ermeni mimari mirasi ve Van Golu manzarasi."),
        ("Van Kalesi", "history", "Urartu mirasini anlamak icin ana durak."),
        ("Van Golu", "nature", "Turkiye'nin en buyuk golu ve manzara rotasi."),
        ("Muradiye Selalesi", "nature", "Dogal mola ve fotograf noktasi."),
        ("Hosap Kalesi", "history", "Tarihi kale ve bolge manzarasi."),
    ],
}


def _fallback_places(city_name):
    return [
        {"name": f"{city_name} {name}", "category": category, "note": f"{city_name} icin guvenli genel {category} odakli kesif duragi."}
        for category, names in DEFAULT_PLACES.items()
        for name in names[:1]
    ][:4]


def _place_dict(name, category, note):
    return {"name": name, "category": category, "note": note}


def build_city_guides():
    guides = {}
    for province in PROVINCE_NAMES:
        raw_places = PLACES.get(province)
        if raw_places:
            places = [_place_dict(name, category, note) for name, category, note in raw_places]
        else:
            places = _fallback_places(province)
        guides[province] = {
            "name": province,
            "aliases": PROVINCE_ALIASES.get(province, [province.lower()]),
            "places": places,
            "foods": FOODS.get(province, []),
        }
    return guides


CITY_GUIDES = build_city_guides()

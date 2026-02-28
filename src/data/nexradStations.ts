/**
 * Complete NEXRAD WSR-88D Radar Station Coordinates
 *
 * Source: NOAA NCEI Historical Observing Metadata Repository (HOMR)
 * URL: https://www.ncei.noaa.gov/access/homr/file/nexrad-stations.txt
 *
 * Coordinates are WGS84 (latitude/longitude in decimal degrees).
 * Elevation is in feet above mean sea level.
 *
 * Includes all operational NEXRAD sites:
 *   - 122 NWS (DOC) sites
 *   - 12 FAA sites
 *   - 21 DOD sites
 *   - Overseas military sites (Kunsan, Camp Humphreys, Kadena, Lajes)
 *   - US territories (Puerto Rico, Guam)
 */

export interface NexradStation {
  /** 4-letter ICAO identifier (e.g., "KTLX") */
  id: string;
  /** Station name / city */
  name: string;
  /** State abbreviation (or country code for overseas) */
  state: string;
  /** Latitude in decimal degrees (WGS84) */
  lat: number;
  /** Longitude in decimal degrees (WGS84) */
  lon: number;
  /** Elevation in feet above mean sea level */
  elev: number;
}

export const NEXRAD_STATIONS: Record<string, NexradStation> = {
  // ===== CONUS NWS (DOC) Sites =====
  KABR: { id: "KABR", name: "Aberdeen", state: "SD", lat: 45.455833, lon: -98.413333, elev: 1383 },
  KABX: { id: "KABX", name: "Albuquerque", state: "NM", lat: 35.149722, lon: -106.823880, elev: 5951 },
  KAKQ: { id: "KAKQ", name: "Norfolk/Richmond", state: "VA", lat: 36.984050, lon: -77.007361, elev: 255 },
  KAMA: { id: "KAMA", name: "Amarillo", state: "TX", lat: 35.233333, lon: -101.709270, elev: 3703 },
  KAMX: { id: "KAMX", name: "Miami", state: "FL", lat: 25.611083, lon: -80.412667, elev: 111 },
  KAPX: { id: "KAPX", name: "Gaylord", state: "MI", lat: 44.906350, lon: -84.719533, elev: 1561 },
  KARX: { id: "KARX", name: "La Crosse", state: "WI", lat: 43.822778, lon: -91.191111, elev: 1357 },
  KATX: { id: "KATX", name: "Seattle/Tacoma", state: "WA", lat: 48.194611, lon: -122.495690, elev: 642 },
  KBBX: { id: "KBBX", name: "Beale AFB", state: "CA", lat: 39.495639, lon: -121.631610, elev: 221 },
  KBGM: { id: "KBGM", name: "Binghamton", state: "NY", lat: 42.199694, lon: -75.984722, elev: 1703 },
  KBHX: { id: "KBHX", name: "Eureka", state: "CA", lat: 40.498583, lon: -124.292160, elev: 2516 },
  KBIS: { id: "KBIS", name: "Bismarck", state: "ND", lat: 46.770833, lon: -100.760550, elev: 1755 },
  KBLX: { id: "KBLX", name: "Billings", state: "MT", lat: 45.853778, lon: -108.606800, elev: 3703 },
  KBMX: { id: "KBMX", name: "Birmingham", state: "AL", lat: 33.172417, lon: -86.770167, elev: 759 },
  KBOX: { id: "KBOX", name: "Boston", state: "MA", lat: 41.955778, lon: -71.136861, elev: 232 },
  KBRO: { id: "KBRO", name: "Brownsville", state: "TX", lat: 25.916000, lon: -97.418967, elev: 88 },
  KBUF: { id: "KBUF", name: "Buffalo", state: "NY", lat: 42.948789, lon: -78.736781, elev: 790 },
  KBYX: { id: "KBYX", name: "Key West", state: "FL", lat: 24.597500, lon: -81.703167, elev: 89 },
  KCAE: { id: "KCAE", name: "Columbia", state: "SC", lat: 33.948722, lon: -81.118278, elev: 345 },
  KCBW: { id: "KCBW", name: "Houlton", state: "ME", lat: 46.039250, lon: -67.806431, elev: 860 },
  KCBX: { id: "KCBX", name: "Boise", state: "ID", lat: 43.490217, lon: -116.236030, elev: 3172 },
  KCCX: { id: "KCCX", name: "State College", state: "PA", lat: 40.923167, lon: -78.003722, elev: 2486 },
  KCLE: { id: "KCLE", name: "Cleveland", state: "OH", lat: 41.413217, lon: -81.859867, elev: 860 },
  KCLX: { id: "KCLX", name: "Charleston", state: "SC", lat: 32.655528, lon: -81.042194, elev: 229 },
  KCRI: { id: "KCRI", name: "ROC FAA Redundant RDA 1", state: "OK", lat: 35.238333, lon: -97.460000, elev: 1315 },
  KCRP: { id: "KCRP", name: "Corpus Christi", state: "TX", lat: 27.784017, lon: -97.511250, elev: 142 },
  KCXX: { id: "KCXX", name: "Burlington", state: "VT", lat: 44.511000, lon: -73.166431, elev: 431 },
  KCYS: { id: "KCYS", name: "Cheyenne", state: "WY", lat: 41.151919, lon: -104.806030, elev: 6193 },
  KDAX: { id: "KDAX", name: "Sacramento", state: "CA", lat: 38.501111, lon: -121.677830, elev: 144 },
  KDDC: { id: "KDDC", name: "Dodge City", state: "KS", lat: 37.760833, lon: -99.968889, elev: 2671 },
  KDFX: { id: "KDFX", name: "Laughlin AFB", state: "TX", lat: 29.273139, lon: -100.280330, elev: 1196 },
  KDGX: { id: "KDGX", name: "Jackson/Brandon", state: "MS", lat: 32.279944, lon: -89.984444, elev: 609 },
  KDIX: { id: "KDIX", name: "Philadelphia", state: "NJ", lat: 39.947089, lon: -74.410731, elev: 230 },
  KDLH: { id: "KDLH", name: "Duluth", state: "MN", lat: 46.836944, lon: -92.209722, elev: 1542 },
  KDMX: { id: "KDMX", name: "Des Moines", state: "IA", lat: 41.731200, lon: -93.722869, elev: 1095 },
  KDOX: { id: "KDOX", name: "Dover AFB", state: "DE", lat: 38.825767, lon: -75.440117, elev: 164 },
  KDTX: { id: "KDTX", name: "Detroit", state: "MI", lat: 42.700000, lon: -83.471667, elev: 1216 },
  KDVN: { id: "KDVN", name: "Davenport", state: "IA", lat: 41.611667, lon: -90.580833, elev: 851 },
  KDYX: { id: "KDYX", name: "Dyess AFB", state: "TX", lat: 32.538500, lon: -99.254333, elev: 1582 },
  KEAX: { id: "KEAX", name: "Kansas City", state: "MO", lat: 38.810250, lon: -94.264472, elev: 1092 },
  KEMX: { id: "KEMX", name: "Tucson", state: "AZ", lat: 31.893650, lon: -110.630250, elev: 5319 },
  KENX: { id: "KENX", name: "Albany", state: "NY", lat: 42.586556, lon: -74.064083, elev: 1935 },
  KEOX: { id: "KEOX", name: "Fort Rucker", state: "AL", lat: 31.460556, lon: -85.459389, elev: 537 },
  KEPZ: { id: "KEPZ", name: "El Paso", state: "NM", lat: 31.873056, lon: -106.698000, elev: 4218 },
  KESX: { id: "KESX", name: "Las Vegas", state: "NV", lat: 35.701350, lon: -114.891650, elev: 4948 },
  KEVX: { id: "KEVX", name: "Eglin AFB", state: "FL", lat: 30.565033, lon: -85.921667, elev: 221 },
  KEWX: { id: "KEWX", name: "Austin/San Antonio", state: "TX", lat: 29.704056, lon: -98.028611, elev: 767 },
  KEYX: { id: "KEYX", name: "Edwards AFB", state: "CA", lat: 35.097850, lon: -117.560750, elev: 2873 },
  KFCX: { id: "KFCX", name: "Roanoke", state: "VA", lat: 37.024400, lon: -80.273969, elev: 2965 },
  KFDR: { id: "KFDR", name: "Altus AFB", state: "OK", lat: 34.362194, lon: -98.976667, elev: 1315 },
  KFDX: { id: "KFDX", name: "Cannon AFB", state: "NM", lat: 34.634167, lon: -103.618880, elev: 4698 },
  KFFC: { id: "KFFC", name: "Atlanta", state: "GA", lat: 33.363550, lon: -84.565950, elev: 972 },
  KFSD: { id: "KFSD", name: "Sioux Falls", state: "SD", lat: 43.587778, lon: -96.729444, elev: 1495 },
  KFSX: { id: "KFSX", name: "Flagstaff", state: "AZ", lat: 34.574333, lon: -111.198440, elev: 7514 },
  KFTG: { id: "KFTG", name: "Denver/Front Range", state: "CO", lat: 39.786639, lon: -104.545800, elev: 5611 },
  KFWS: { id: "KFWS", name: "Dallas/Fort Worth", state: "TX", lat: 32.573000, lon: -97.303150, elev: 777 },
  KGGW: { id: "KGGW", name: "Glasgow", state: "MT", lat: 48.206361, lon: -106.624690, elev: 2384 },
  KGJX: { id: "KGJX", name: "Grand Junction", state: "CO", lat: 39.062169, lon: -108.213760, elev: 10101 },
  KGLD: { id: "KGLD", name: "Goodland", state: "KS", lat: 39.366944, lon: -101.700270, elev: 3716 },
  KGRB: { id: "KGRB", name: "Green Bay", state: "WI", lat: 44.498633, lon: -88.111111, elev: 823 },
  KGRK: { id: "KGRK", name: "Fort Hood", state: "TX", lat: 30.721833, lon: -97.382944, elev: 603 },
  KGRR: { id: "KGRR", name: "Grand Rapids", state: "MI", lat: 42.893889, lon: -85.544889, elev: 875 },
  KGSP: { id: "KGSP", name: "Greer", state: "SC", lat: 34.883306, lon: -82.219833, elev: 1069 },
  KGWX: { id: "KGWX", name: "Columbus AFB", state: "MS", lat: 33.896917, lon: -88.329194, elev: 590 },
  KGYX: { id: "KGYX", name: "Portland", state: "ME", lat: 43.891306, lon: -70.256361, elev: 474 },
  KHDC: { id: "KHDC", name: "Hammond", state: "LA", lat: 30.519300, lon: -90.407400, elev: 43 },
  KHDX: { id: "KHDX", name: "Holloman AFB", state: "NM", lat: 33.077000, lon: -106.120030, elev: 4270 },
  KHGX: { id: "KHGX", name: "Houston/Galveston", state: "TX", lat: 29.471900, lon: -95.078733, elev: 115 },
  KHNX: { id: "KHNX", name: "San Joaquin Valley", state: "CA", lat: 36.314181, lon: -119.632130, elev: 340 },
  KHPX: { id: "KHPX", name: "Fort Campbell", state: "KY", lat: 36.736972, lon: -87.285583, elev: 613 },
  KHTX: { id: "KHTX", name: "Huntsville", state: "AL", lat: 34.930556, lon: -86.083611, elev: 1859 },
  KICT: { id: "KICT", name: "Wichita", state: "KS", lat: 37.654444, lon: -97.443056, elev: 1400 },
  KICX: { id: "KICX", name: "Cedar City", state: "UT", lat: 37.591050, lon: -112.862180, elev: 10757 },
  KILN: { id: "KILN", name: "Cincinnati", state: "OH", lat: 39.420483, lon: -83.821450, elev: 1170 },
  KILX: { id: "KILX", name: "Lincoln", state: "IL", lat: 40.150500, lon: -89.336792, elev: 731 },
  KIND: { id: "KIND", name: "Indianapolis", state: "IN", lat: 39.707500, lon: -86.280278, elev: 887 },
  KINX: { id: "KINX", name: "Tulsa", state: "OK", lat: 36.175131, lon: -95.564161, elev: 749 },
  KIWA: { id: "KIWA", name: "Phoenix", state: "AZ", lat: 33.289233, lon: -111.669910, elev: 1426 },
  KIWX: { id: "KIWX", name: "Fort Wayne", state: "IN", lat: 41.358611, lon: -85.700000, elev: 1056 },
  KJAX: { id: "KJAX", name: "Jacksonville", state: "FL", lat: 30.484633, lon: -81.701900, elev: 160 },
  KJGX: { id: "KJGX", name: "Robins AFB", state: "GA", lat: 32.675683, lon: -83.350833, elev: 618 },
  KJKL: { id: "KJKL", name: "Jackson", state: "KY", lat: 37.590833, lon: -83.313056, elev: 1461 },
  KLBB: { id: "KLBB", name: "Lubbock", state: "TX", lat: 33.654139, lon: -101.814160, elev: 3378 },
  KLCH: { id: "KLCH", name: "Lake Charles", state: "LA", lat: 30.125306, lon: -93.215889, elev: 137 },
  KLGX: { id: "KLGX", name: "Langley Hill", state: "WA", lat: 47.116944, lon: -124.106660, elev: 366 },
  KLIX: { id: "KLIX", name: "New Orleans", state: "LA", lat: 30.336667, lon: -89.825417, elev: 179 },
  KLNX: { id: "KLNX", name: "North Platte", state: "NE", lat: 41.957944, lon: -100.576220, elev: 3113 },
  KLOT: { id: "KLOT", name: "Chicago", state: "IL", lat: 41.604444, lon: -88.084444, elev: 760 },
  KLRX: { id: "KLRX", name: "Elko", state: "NV", lat: 40.739550, lon: -116.802700, elev: 6895 },
  KLSX: { id: "KLSX", name: "St. Louis", state: "MO", lat: 38.698611, lon: -90.682778, elev: 722 },
  KLTX: { id: "KLTX", name: "Wilmington", state: "NC", lat: 33.989150, lon: -78.429108, elev: 145 },
  KLVX: { id: "KLVX", name: "Louisville", state: "KY", lat: 37.975278, lon: -85.943889, elev: 833 },
  KLWX: { id: "KLWX", name: "Sterling", state: "VA", lat: 38.976111, lon: -77.487500, elev: 404 },
  KLZK: { id: "KLZK", name: "Little Rock", state: "AR", lat: 34.836500, lon: -92.262194, elev: 649 },
  KMAF: { id: "KMAF", name: "Midland/Odessa", state: "TX", lat: 31.943461, lon: -102.189250, elev: 2962 },
  KMAX: { id: "KMAX", name: "Medford", state: "OR", lat: 42.081169, lon: -122.717360, elev: 7561 },
  KMBX: { id: "KMBX", name: "Minot AFB", state: "ND", lat: 48.393056, lon: -100.864440, elev: 1590 },
  KMHX: { id: "KMHX", name: "Morehead City", state: "NC", lat: 34.775908, lon: -76.876189, elev: 145 },
  KMKX: { id: "KMKX", name: "Milwaukee", state: "WI", lat: 42.967900, lon: -88.550667, elev: 1023 },
  KMLB: { id: "KMLB", name: "Melbourne", state: "FL", lat: 28.113194, lon: -80.654083, elev: 149 },
  KMOB: { id: "KMOB", name: "Mobile", state: "AL", lat: 30.679444, lon: -88.240000, elev: 289 },
  KMPX: { id: "KMPX", name: "Minneapolis", state: "MN", lat: 44.848889, lon: -93.565528, elev: 1101 },
  KMQT: { id: "KMQT", name: "Marquette", state: "MI", lat: 46.531111, lon: -87.548333, elev: 1525 },
  KMRX: { id: "KMRX", name: "Knoxville", state: "TN", lat: 36.168611, lon: -83.401944, elev: 1434 },
  KMSX: { id: "KMSX", name: "Missoula", state: "MT", lat: 47.041000, lon: -113.986220, elev: 7978 },
  KMTX: { id: "KMTX", name: "Salt Lake City", state: "UT", lat: 41.262778, lon: -112.447770, elev: 6594 },
  KMUX: { id: "KMUX", name: "San Francisco", state: "CA", lat: 37.155222, lon: -121.898440, elev: 3550 },
  KMVX: { id: "KMVX", name: "Grand Forks", state: "ND", lat: 47.527778, lon: -97.325556, elev: 1083 },
  KMXX: { id: "KMXX", name: "Maxwell AFB", state: "AL", lat: 32.536650, lon: -85.789750, elev: 560 },
  KNKX: { id: "KNKX", name: "San Diego", state: "CA", lat: 32.919017, lon: -117.041800, elev: 1052 },
  KNQA: { id: "KNQA", name: "Memphis", state: "TN", lat: 35.344722, lon: -89.873333, elev: 435 },
  KOAX: { id: "KOAX", name: "Omaha", state: "NE", lat: 41.320369, lon: -96.366819, elev: 1262 },
  KOHX: { id: "KOHX", name: "Nashville", state: "TN", lat: 36.247222, lon: -86.562500, elev: 676 },
  KOKX: { id: "KOKX", name: "New York City", state: "NY", lat: 40.865528, lon: -72.863917, elev: 199 },
  KOTX: { id: "KOTX", name: "Spokane", state: "WA", lat: 47.680417, lon: -117.626770, elev: 2449 },
  KOUN: { id: "KOUN", name: "Norman (NSSL)", state: "OK", lat: 35.236058, lon: -97.462350, elev: 1284 },
  KPAH: { id: "KPAH", name: "Paducah", state: "KY", lat: 37.068333, lon: -88.771944, elev: 506 },
  KPBZ: { id: "KPBZ", name: "Pittsburgh", state: "PA", lat: 40.531717, lon: -80.217967, elev: 1266 },
  KPDT: { id: "KPDT", name: "Pendleton", state: "OR", lat: 45.690650, lon: -118.852930, elev: 1580 },
  KPOE: { id: "KPOE", name: "Fort Polk", state: "LA", lat: 31.155278, lon: -92.976111, elev: 473 },
  KPUX: { id: "KPUX", name: "Pueblo", state: "CO", lat: 38.459550, lon: -104.181350, elev: 5363 },
  KRAX: { id: "KRAX", name: "Raleigh/Durham", state: "NC", lat: 35.665519, lon: -78.489750, elev: 462 },
  KRGX: { id: "KRGX", name: "Reno", state: "NV", lat: 39.754056, lon: -119.462020, elev: 8396 },
  KRIW: { id: "KRIW", name: "Riverton", state: "WY", lat: 43.066089, lon: -108.477300, elev: 5633 },
  KRLX: { id: "KRLX", name: "Charleston", state: "WV", lat: 38.311111, lon: -81.722778, elev: 1213 },
  KRTX: { id: "KRTX", name: "Portland", state: "OR", lat: 45.715039, lon: -122.965000, elev: 1728 },
  KSFX: { id: "KSFX", name: "Pocatello", state: "ID", lat: 43.105600, lon: -112.686130, elev: 4539 },
  KSGF: { id: "KSGF", name: "Springfield", state: "MO", lat: 37.235239, lon: -93.400419, elev: 1375 },
  KSHV: { id: "KSHV", name: "Shreveport", state: "LA", lat: 32.450833, lon: -93.841250, elev: 387 },
  KSJT: { id: "KSJT", name: "San Angelo", state: "TX", lat: 31.371278, lon: -100.492500, elev: 2004 },
  KSOX: { id: "KSOX", name: "Santa Ana Mountains", state: "CA", lat: 33.817733, lon: -117.636000, elev: 3106 },
  KSRX: { id: "KSRX", name: "Fort Smith", state: "AR", lat: 35.290417, lon: -94.361889, elev: 737 },
  KTBW: { id: "KTBW", name: "Tampa Bay", state: "FL", lat: 27.705500, lon: -82.401778, elev: 122 },
  KTFX: { id: "KTFX", name: "Great Falls", state: "MT", lat: 47.459583, lon: -111.385330, elev: 3805 },
  KTLH: { id: "KTLH", name: "Tallahassee", state: "FL", lat: 30.397583, lon: -84.328944, elev: 177 },
  KTLX: { id: "KTLX", name: "Oklahoma City", state: "OK", lat: 35.333361, lon: -97.277761, elev: 1278 },
  KTWX: { id: "KTWX", name: "Topeka", state: "KS", lat: 38.996950, lon: -96.232550, elev: 1415 },
  KTYX: { id: "KTYX", name: "Fort Drum", state: "NY", lat: 43.755694, lon: -75.679861, elev: 1960 },
  KUDX: { id: "KUDX", name: "Rapid City", state: "SD", lat: 44.124722, lon: -102.830000, elev: 3195 },
  KUEX: { id: "KUEX", name: "Hastings", state: "NE", lat: 40.320833, lon: -98.441944, elev: 2057 },
  KVAX: { id: "KVAX", name: "Moody AFB", state: "GA", lat: 30.890278, lon: -83.001806, elev: 330 },
  KVBX: { id: "KVBX", name: "Vandenberg AFB", state: "CA", lat: 34.838550, lon: -120.397910, elev: 1354 },
  KVNX: { id: "KVNX", name: "Vance AFB", state: "OK", lat: 36.740617, lon: -98.127717, elev: 1258 },
  KVTX: { id: "KVTX", name: "Los Angeles", state: "CA", lat: 34.412017, lon: -119.178750, elev: 2807 },
  KVWX: { id: "KVWX", name: "Evansville", state: "IN", lat: 38.260250, lon: -87.724528, elev: 625 },
  KYUX: { id: "KYUX", name: "Yuma", state: "AZ", lat: 32.495281, lon: -114.656710, elev: 239 },

  // ===== Alaska (FAA and NWS) =====
  PABC: { id: "PABC", name: "Bethel", state: "AK", lat: 60.791944, lon: -161.876380, elev: 193 },
  PACG: { id: "PACG", name: "Sitka", state: "AK", lat: 56.852778, lon: -135.529160, elev: 272 },
  PAEC: { id: "PAEC", name: "Nome", state: "AK", lat: 64.511389, lon: -165.295000, elev: 90 },
  PAHG: { id: "PAHG", name: "Anchorage", state: "AK", lat: 60.725914, lon: -151.351460, elev: 356 },
  PAIH: { id: "PAIH", name: "Middleton Island", state: "AK", lat: 59.460767, lon: -146.303440, elev: 132 },
  PAKC: { id: "PAKC", name: "King Salmon", state: "AK", lat: 58.679444, lon: -156.629440, elev: 144 },
  PAPD: { id: "PAPD", name: "Fairbanks/Pedro Dome", state: "AK", lat: 65.035114, lon: -147.501430, elev: 2707 },

  // ===== Hawaii =====
  PHKI: { id: "PHKI", name: "South Kauai", state: "HI", lat: 21.893889, lon: -159.552500, elev: 340 },
  PHKM: { id: "PHKM", name: "Kamuela/Kohala", state: "HI", lat: 20.125278, lon: -155.777770, elev: 3966 },
  PHMO: { id: "PHMO", name: "Molokai", state: "HI", lat: 21.132778, lon: -157.180270, elev: 1444 },
  PHWA: { id: "PHWA", name: "South Shore", state: "HI", lat: 19.095000, lon: -155.568880, elev: 1461 },

  // ===== US Territories =====
  TJUA: { id: "TJUA", name: "San Juan", state: "PR", lat: 18.115667, lon: -66.078167, elev: 2958 },
  PGUA: { id: "PGUA", name: "Andersen AFB/Guam", state: "GU", lat: 13.455833, lon: 144.811111, elev: 386 },

  // ===== Overseas DOD Sites =====
  RKJK: { id: "RKJK", name: "Kunsan AB", state: "KR", lat: 35.924167, lon: 126.622222, elev: 192 },
  RKSG: { id: "RKSG", name: "Camp Humphreys", state: "KR", lat: 37.207569, lon: 127.285561, elev: 1521 },
  RODN: { id: "RODN", name: "Kadena AB", state: "JP", lat: 26.307800, lon: 127.903469, elev: 412 },
  LPLA: { id: "LPLA", name: "Lajes AB", state: "PT", lat: 38.730280, lon: -27.321670, elev: 3334 },
};

/**
 * Lookup a station by its 3-letter identifier (without the K/P/T/R prefix).
 * For example, "TLX" will find KTLX.
 */
export function findStationByShortId(shortId: string): NexradStation | undefined {
  const upper = shortId.toUpperCase();
  // Try common prefixes
  for (const prefix of ["K", "PA", "PH", "TJ", "PG", "RK", "RO", "LP"]) {
    const fullId = prefix + upper;
    if (NEXRAD_STATIONS[fullId]) {
      return NEXRAD_STATIONS[fullId];
    }
  }
  // Direct lookup
  return NEXRAD_STATIONS[upper];
}

/**
 * Get all station IDs as a sorted array.
 */
export function getAllStationIds(): string[] {
  return Object.keys(NEXRAD_STATIONS).sort();
}

/**
 * Get the total count of stations.
 */
export function getStationCount(): number {
  return Object.keys(NEXRAD_STATIONS).length;
}

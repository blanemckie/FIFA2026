const fetch = require('node-fetch');
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

const API_KEY      = process.env.FOOTBALL_DATA_TOKEN;
const API_HOST     = 'v3.football.api-sports.io';
const WC_LEAGUE_ID = 22;
const WC_SEASON    = 2026;

const TEAM_ALIASES = {
  'Korea Republic':               'South Korea',
  'Republic of Korea':            'South Korea',
  'Czechia':                      'Czech Republic',
  'Bosnia and Herzegovina':       'Bosnia & Herzegovina',
  'Bosnia-Herzegovina':           'Bosnia & Herzegovina',
  "Côte d'Ivoire":                'Ivory Coast',
  "Cote d'Ivoire":                'Ivory Coast',
  'United States':                'USA',
  'Congo DR':                     'DR Congo',
  'DR Congo':                     'DR Congo',
  'Democratic Republic of Congo': 'DR Congo',
  'Curaçao':                      'Curacao',
  'Cabo Verde':                   'Cape Verde',
  'Cape Verde Islands':           'Cape Verde',
  'IR Iran':                      'Iran',
  'Türkiye':                      'Turkey',
};

function normalise(name) {
  const t = String(name || '').trim();
  return TEAM_ALIASES[t] || t;
}

const WCP_FIXTURES = [
  {id:1,  home:'Mexico',               away:'South Africa'},
  {id:2,  home:'South Korea',          away:'Czech Republic'},
  {id:3,  home:'Canada',               away:'Bosnia & Herzegovina'},
  {id:4,  home:'USA',                  away:'Paraguay'},
  {id:5,  home:'Qatar',                away:'Switzerland'},
  {id:6,  home:'Brazil',               away:'Morocco'},
  {id:7,  home:'Haiti',                away:'Scotland'},
  {id:8,  home:'Australia',            away:'Turkey'},
  {id:9,  home:'Germany',              away:'Curacao'},
  {id:10, home:'Netherlands',          away:'Japan'},
  {id:11, home:'Ivory Coast',          away:'Ecuador'},
  {id:12, home:'Sweden',               away:'Tunisia'},
  {id:13, home:'Spain',                away:'Cape Verde'},
  {id:14, home:'Belgium',              away:'Egypt'},
  {id:15, home:'Saudi Arabia',         away:'Uruguay'},
  {id:16, home:'Iran',                 away:'New Zealand'},
  {id:17, home:'France',               away:'Senegal'},
  {id:18, home:'Iraq',                 away:'Norway'},
  {id:19, home:'Argentina',            away:'Algeria'},
  {id:20, home:'Austria',              away:'Jordan'},
  {id:21, home:'Portugal',             away:'DR Congo'},
  {id:22, home:'England',              away:'Croatia'},
  {id:23, home:'Ghana',                away:'Panama'},
  {id:24, home:'Uzbekistan',           away:'Colombia'},
  {id:25, home:'Czech Republic',       away:'South Africa'},
  {id:26, home:'Switzerland',          away:'Bosnia & Herzegovina'},
  {id:27, home:'Canada',               away:'Qatar'},
  {id:28, home:'Mexico',               away:'South Korea'},
  {id:29, home:'USA',                  away:'Australia'},
  {id:30, home:'Scotland',             away:'Morocco'},
  {id:31, home:'Brazil',               away:'Haiti'},
  {id:32, home:'Turkey',               away:'Paraguay'},
  {id:33, home:'Netherlands',          away:'Sweden'},
  {id:34, home:'Germany',              away:'Ivory Coast'},
  {id:35, home:'Ecuador',              away:'Curacao'},
  {id:36, home:'Tunisia',              away:'Japan'},
  {id:37, home:'Spain',                away:'Saudi Arabia'},
  {id:38, home:'Belgium',              away:'Iran'},
  {id:39, home:'Uruguay',              away:'Cape Verde'},
  {id:40, home:'New Zealand',          away:'Egypt'},
  {id:41, home:'Argentina',            away:'Austria'},
  {id:42, home:'France',               away:'Iraq'},
  {id:43, home:'Norway',               away:'Senegal'},
  {id:44, home:'Jordan',               away:'Algeria'},
  {id:45, home:'Portugal',             away:'Uzbekistan'},
  {id:46, home:'England',              away:'Ghana'},
  {id:47, home:'Panama',               away:'Croatia'},
  {id:48, home:'Colombia',             away:'DR Congo'},
  {id:49, home:'Switzerland',          away:'Canada'},
  {id:50, home:'Bosnia & Herzegovina', away:'Qatar'},
  {id:51, home:'Morocco',              away:'Haiti'},
  {id:52, home:'Scotland',             away:'Brazil'},
  {id:53, home:'South Africa',         away:'South Korea'},
  {id:54, home:'Czech Republic',       away:'Mexico'},
  {id:55, home:'Curacao',              away:'Ivory Coast'},
  {id:56, home:'Ecuador',              away:'Germany'},
  {id:57, home:'Tunisia',              away:'Netherlands'},
  {id:58, home:'Japan',                away:'Sweden'},
  {id:59, home:'Turkey',               away:'USA'},
  {id:60, home:'Paraguay',             away:'Australia'},
  {id:61, home:'Norway',               away:'France'},
  {id:62, home:'Senegal',              away:'Iraq'},
  {id:63, home:'Cape Verde',           away:'Saudi Arabia'},
  {id:64, home:'Uruguay',              away:'Spain'},
  {id:65, home:'New Zealand',          away:'Belgium'},
  {id:66, home:'Egypt',                away:'Iran'},
  {id:67, home:'Panama',               away:'England'},
  {id:68, home:'Croatia',              away:'Ghana'},
  {id:69, home:'Colombia',             away:'Portugal'},
  {id:70, home:'DR Congo',             away:'Uzbekistan'},
  {id:71, home:'Algeria',              away:'Austria'},
  {id:72, home:'Jordan',               away:'Argentina'},
];
async function fetchCompletedMatches() {
  const url = `https://${API_HOST}/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}&status=FT`;
  console.log(`Fetching: ${url}`);
  const res = await fetch(url, {
    headers: {
      'x-apisports-key': API_KEY,
      'x-apisports-host': API_HOST,
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`api-football responded ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!data.response || !Array.isArray(data.response)) {
    console.log('Raw response:', JSON.stringify(data).slice(0, 300));
    throw new Error('Unexpected response structure from api-football');
  }
  console.log(`✅ api-football returned ${data.response.length} finished matches`);
  data.response.forEach(f => {
    const home = f.teams?.home?.name;
    const away = f.teams?.away?.name;
    const hg = f.goals?.home;
    const ag = f.goals?.away;
    console.log(`  API match: "${home}" vs "${away}" — ${hg}:${ag}`);
  });
  return data.response;
}

function buildResultsMap(fixtures) {
  const map = {};
  for (const f of fixtures) {
    const home = normalise(f.teams?.home?.name);
    const away = normalise(f.teams?.away?.name);
    const homeGoals = f.goals?.home;
    const awayGoals = f.goals?.away;
    if (home && away && homeGoals != null && awayGoals != null) {
      map[`${home}|${away}`] = { homeGoals: Number(homeGoals), awayGoals: Number(awayGoals) };
      console.log(`  Mapped: "${home}" vs "${away}" — ${homeGoals}:${awayGoals}`);
    }
  }
  return map;
}

function resolveResults(resultsMap) {
  const resolved = {};
  for (const fx of WCP_FIXTURES) {
    resolved[fx.id] = resultsMap[`${fx.home}|${fx.away}`] || null;
  }
  return resolved;
}

function outcome(h, a) { return h > a ? 'H' : a > h ? 'A' : 'D'; }

function scoreMatch(aH, aA, pH, pA) {
  aH = Number(aH); aA = Number(aA); pH = Number(pH); pA = Number(pA);
  if ([aH,aA,pH,pA].some(v => isNaN(v))) return { points:0, reason:'invalid' };
  if (outcome(aH,aA) !== outcome(pH,pA)) return { points:0, reason:'wrong_result' };
  if (aH===pH && aA===pA) return { points:10, reason:'exact_score' };
  return { points:5, reason:'correct_result' };
}

function calcPlayerPoints(groupPredictions, resolvedResults) {
  let total = 0;
  const matchBreakdown = {};
  for (const pick of (groupPredictions || [])) {
    const actual = resolvedResults[pick.matchId];
    if (!actual) { matchBreakdown[pick.matchId] = { points:0, reason:'pending' }; continue; }
    const { points, reason } = scoreMatch(actual.homeGoals, actual.awayGoals, pick.homeScore, pick.awayScore);
    total += points;
    matchBreakdown[pick.matchId] = { points, reason, actualHome:actual.homeGoals, actualAway:actual.awayGoals };
  }
  return { total, matchBreakdown };
}

async function main() {
  console.log('─── WCP Score Updater ───');
  console.log(`Time: ${new Date().toISOString()}`);
  const fixtures        = await fetchCompletedMatches();
  const resultsMap      = buildResultsMap(fixtures);
  const resolvedResults = resolveResults(resultsMap);
  const completedCount  = Object.values(resolvedResults).filter(Boolean).length;
  console.log(`📊 Matched ${completedCount} of 72 group fixtures`);
  for (const fx of WCP_FIXTURES) {
    const r = resolvedResults[fx.id];
    if (r) console.log(`  ✓ Match ${fx.id}: ${fx.home} ${r.homeGoals}-${r.awayGoals} ${fx.away}`);
  }
  if (completedCount === 0) { console.log('ℹ️  No completed fixtures yet.'); return; }
  const snapshot = await db.collection('predictions').where('locked','==',true).get();
  console.log(`\n👥 ${snapshot.size} locked predictions to score`);
  if (snapshot.empty) return;
  const batch = db.batch();
  let updated = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const { total, matchBreakdown } = calcPlayerPoints(data.groupPredictions||[], resolvedResults);
    if (data.totalPoints === total) continue;
    batch.update(doc.ref, {
      totalPoints:         total,
      groupMatchBreakdown: matchBreakdown,
      scoresLastUpdated:   admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  📝 ${data.name}: ${data.totalPoints ?? 'unset'} → ${total} pts`);
    updated++;
  }
  if (updated === 0) { console.log('✅ All scores already up to date.'); return; }
  await batch.commit();
  console.log(`\n✅ Updated ${updated} player scores in Firestore.`);
}

main().catch(err => { console.error('❌ Fatal error:', err); process.exit(1); });

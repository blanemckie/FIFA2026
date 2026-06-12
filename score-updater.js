/**
 * WCP Score Updater — score-updater.js
 * Uses football-data.org API (free tier, FIFA World Cup included)
 * Runs via GitHub Actions every 30 minutes.
 *
 * Scoring rules (group stage):
 *   5 pts — correct result (home win / away win / draw)
 *   5 pts — correct exact scoreline (only if result also correct)
 *  10 pts — maximum per match
 */

const fetch = require('node-fetch');
const admin = require('firebase-admin');

// ── Firebase init ─────────────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

// ── football-data.org config ──────────────────────────────────────────
const FD_TOKEN   = process.env.FOOTBALL_DATA_TOKEN;
const FD_BASE    = 'https://api.football-data.org/v4';
const WC_CODE    = 'WC'; // FIFA World Cup competition code

// ── Team name aliases ─────────────────────────────────────────────────
// Maps football-data.org names → your site's names
const TEAM_ALIASES = {
  'Korea Republic':                'South Korea',
  'Republic of Korea':             'South Korea',
  'Czechia':                       'Czech Republic',
  'Bosnia and Herzegovina':        'Bosnia & Herzegovina',
  "Côte d'Ivoire":                 'Ivory Coast',
  "Cote d'Ivoire":                 'Ivory Coast',
  'United States':                 'USA',
  'USA':                           'USA',
  'Congo DR':                      'DR Congo',
  'Democratic Republic of Congo':  'DR Congo',
  'Curaçao':                       'Curacao',
  'Cabo Verde':                    'Cape Verde',
  'Cape Verde Islands':            'Cape Verde',
  'IR Iran':                       'Iran',
  'Türkiye':                       'Turkey',
};

function normalise(name) {
  const t = String(name || '').trim();
  return TEAM_ALIASES[t] || t;
}

// ── Your 72 group-stage fixtures ──────────────────────────────────────
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

// ── Fetch completed World Cup matches from football-data.org ──────────
async function fetchCompletedMatches() {
  // Fetch FINISHED matches with season=2026 to ensure correct tournament
  // Also fetch PAUSED/IN_PLAY as fallback in case status lags behind
  const url = `${FD_BASE}/competitions/WC/matches?season=2026&status=FINISHED`;
  const res = await fetch(url, {
    headers: { 'X-Auth-Token': FD_TOKEN }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data.org responded ${res.status}: ${body}`);
  }

  const data = await res.json();
  if (!data.matches || !Array.isArray(data.matches)) {
    throw new Error('Unexpected response structure from football-data.org');
  }

  console.log(`✅ football-data.org returned ${data.matches.length} finished matches`);
  data.matches.forEach(m => {
    const h = m.score?.fullTime?.home;
    const a = m.score?.fullTime?.away;
    console.log(`  "${m.homeTeam?.name}" vs "${m.awayTeam?.name}" — ${h !== null && h !== undefined ? h+':'+a : 'null:null (data lag)'}`);
  });
  return data.matches;
}

// ── Build lookup: "Home|Away" → { homeGoals, awayGoals } ─────────────
function buildResultsMap(matches) {
  const map = {};
  for (const m of matches) {
    const home = normalise(m.homeTeam?.name || m.homeTeam?.shortName);
    const away = normalise(m.awayTeam?.name || m.awayTeam?.shortName);
    const homeGoals = m.score?.fullTime?.home;
    const awayGoals = m.score?.fullTime?.away;

    if (home && away && homeGoals !== null && homeGoals !== undefined
        && awayGoals !== null && awayGoals !== undefined) {
      map[`${home}|${away}`] = {
        homeGoals: Number(homeGoals),
        awayGoals: Number(awayGoals),
      };
    }
  }
  return map;
}

// ── Match internal fixture IDs to API results ─────────────────────────
function resolveResults(resultsMap) {
  const resolved = {};
  for (const fx of WCP_FIXTURES) {
    resolved[fx.id] = resultsMap[`${fx.home}|${fx.away}`] || null;
  }
  return resolved;
}

// ── Scoring logic ─────────────────────────────────────────────────────
function outcome(h, a) { return h > a ? 'H' : a > h ? 'A' : 'D'; }

function scoreMatch(actualHome, actualAway, predictedHome, predictedAway) {
  const aH = Number(actualHome), aA = Number(actualAway);
  const pH = Number(predictedHome), pA = Number(predictedAway);

  if ([aH, aA, pH, pA].some(v => isNaN(v))) {
    return { points: 0, reason: 'invalid' };
  }
  if (outcome(aH, aA) !== outcome(pH, pA)) {
    return { points: 0, reason: 'wrong_result' };
  }
  if (aH === pH && aA === pA) {
    return { points: 10, reason: 'exact_score' };
  }
  return { points: 5, reason: 'correct_result' };
}

// ── Calculate total points for one player ────────────────────────────
function calcPlayerPoints(groupPredictions, resolvedResults) {
  let total = 0;
  const matchBreakdown = {};

  for (const pick of (groupPredictions || [])) {
    const actual = resolvedResults[pick.matchId];
    if (!actual) {
      matchBreakdown[String(pick.matchId)] = { points: 0, reason: 'pending' };
      continue;
    }
    const { points, reason } = scoreMatch(
      actual.homeGoals, actual.awayGoals,
      pick.homeScore,   pick.awayScore
    );
    total += points;
    matchBreakdown[String(pick.matchId)] = {
      points, reason,
      actualHome: actual.homeGoals,
      actualAway: actual.awayGoals,
    };
  }

  return { total, matchBreakdown };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('─── WCP Score Updater ───');
  console.log(`Time: ${new Date().toISOString()}`);

  const matches = await fetchCompletedMatches();
  const resultsMap      = buildResultsMap(matches);
  const resolvedResults = resolveResults(resultsMap);

  const completedCount = Object.values(resolvedResults).filter(Boolean).length;
  console.log(`📊 Matched ${completedCount} of 72 group fixtures`);

  // Log matched results so you can spot any alias issues
  for (const fx of WCP_FIXTURES) {
    const r = resolvedResults[fx.id];
    if (r) console.log(`  ✓ Match ${fx.id}: ${fx.home} ${r.homeGoals}-${r.awayGoals} ${fx.away}`);
  }

  if (completedCount === 0) {
    console.log('ℹ️  No completed fixtures yet — nothing to score.');
    return;
  }

  // Load all locked predictions
  const snapshot = await db.collection('predictions')
    .where('locked', '==', true)
    .get();

  console.log(`\n👥 ${snapshot.size} locked predictions to score`);
  if (snapshot.empty) return;

  // Score and batch-write only changed documents
  const batch = db.batch();
  let updated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const { total, matchBreakdown } = calcPlayerPoints(
      data.groupPredictions || [],
      resolvedResults
    );

    const hasPending = Object.values(matchBreakdown).some(m => m.reason === 'pending');
    if (data.totalPoints === total && !hasPending) continue;

    batch.update(doc.ref, {
      totalPoints:         total,
      groupMatchBreakdown: matchBreakdown,
      scoresLastUpdated:   admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`  📝 ${data.name}: ${data.totalPoints ?? 'unset'} → ${total} pts`);
    updated++;
  }

  if (updated === 0) {
    console.log('✅ All scores already up to date.');
    return;
  }

  await batch.commit();
  console.log(`\n✅ Updated ${updated} player scores in Firestore.`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

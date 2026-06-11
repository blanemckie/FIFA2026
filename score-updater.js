/**
 * WCP Score Updater — score-updater.js
 * ─────────────────────────────────────────────────────────────────────
 * Runs via GitHub Actions every 30 minutes during the World Cup.
 * 1. Fetches completed group-stage results from api-football.com
 * 2. Matches each result to your WCP_FIXTURES by home/away team name
 * 3. Scores every locked player prediction using 5+5 group stage logic
 * 4. Writes totalPoints + per-match breakdown back to each Firestore doc
 * ─────────────────────────────────────────────────────────────────────
 * Scoring rules (group stage):
 *   5 pts — correct result (home win / draw / away win)
 *   5 pts — correct exact scoreline (only awarded if result also correct)
 *  10 pts — maximum per match
 * ─────────────────────────────────────────────────────────────────────
 */

const fetch = require('node-fetch');
const admin = require('firebase-admin');

// ─── Firebase Admin init (uses GitHub Secrets) ───────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // GitHub Secrets encode newlines as \n — this restores them
    privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

// ─── api-football.com config ─────────────────────────────────────────
const API_KEY      = process.env.API_FOOTBALL_KEY;
const API_HOST     = 'v3.football.api-sports.io';
const WC2026_ID    = 1; // FIFA World Cup 2026 league ID on api-football
const WC2026_SEASON = 2026;

// ─── Your 72 group-stage fixtures (home/away team names as in your site)
// These are used to match API responses back to your internal match IDs.
const WCP_FIXTURES = [
  {id:1,  home:'Mexico',              away:'South Africa'},
  {id:2,  home:'South Korea',         away:'Czech Republic'},
  {id:3,  home:'Canada',              away:'Bosnia & Herzegovina'},
  {id:4,  home:'USA',                 away:'Paraguay'},
  {id:5,  home:'Qatar',               away:'Switzerland'},
  {id:6,  home:'Brazil',              away:'Morocco'},
  {id:7,  home:'Haiti',               away:'Scotland'},
  {id:8,  home:'Australia',           away:'Turkey'},
  {id:9,  home:'Germany',             away:'Curacao'},
  {id:10, home:'Netherlands',         away:'Japan'},
  {id:11, home:'Ivory Coast',         away:'Ecuador'},
  {id:12, home:'Sweden',              away:'Tunisia'},
  {id:13, home:'Spain',               away:'Cape Verde'},
  {id:14, home:'Belgium',             away:'Egypt'},
  {id:15, home:'Saudi Arabia',        away:'Uruguay'},
  {id:16, home:'Iran',                away:'New Zealand'},
  {id:17, home:'France',              away:'Senegal'},
  {id:18, home:'Iraq',                away:'Norway'},
  {id:19, home:'Argentina',           away:'Algeria'},
  {id:20, home:'Austria',             away:'Jordan'},
  {id:21, home:'Portugal',            away:'DR Congo'},
  {id:22, home:'England',             away:'Croatia'},
  {id:23, home:'Ghana',               away:'Panama'},
  {id:24, home:'Uzbekistan',          away:'Colombia'},
  {id:25, home:'Czech Republic',      away:'South Africa'},
  {id:26, home:'Switzerland',         away:'Bosnia & Herzegovina'},
  {id:27, home:'Canada',              away:'Qatar'},
  {id:28, home:'Mexico',              away:'South Korea'},
  {id:29, home:'USA',                 away:'Australia'},
  {id:30, home:'Scotland',            away:'Morocco'},
  {id:31, home:'Brazil',              away:'Haiti'},
  {id:32, home:'Turkey',              away:'Paraguay'},
  {id:33, home:'Netherlands',         away:'Sweden'},
  {id:34, home:'Germany',             away:'Ivory Coast'},
  {id:35, home:'Ecuador',             away:'Curacao'},
  {id:36, home:'Tunisia',             away:'Japan'},
  {id:37, home:'Spain',               away:'Saudi Arabia'},
  {id:38, home:'Belgium',             away:'Iran'},
  {id:39, home:'Uruguay',             away:'Cape Verde'},
  {id:40, home:'New Zealand',         away:'Egypt'},
  {id:41, home:'Argentina',           away:'Austria'},
  {id:42, home:'France',              away:'Iraq'},
  {id:43, home:'Norway',              away:'Senegal'},
  {id:44, home:'Jordan',              away:'Algeria'},
  {id:45, home:'Portugal',            away:'Uzbekistan'},
  {id:46, home:'England',             away:'Ghana'},
  {id:47, home:'Panama',              away:'Croatia'},
  {id:48, home:'Colombia',            away:'DR Congo'},
  {id:49, home:'Switzerland',         away:'Canada'},
  {id:50, home:'Bosnia & Herzegovina',away:'Qatar'},
  {id:51, home:'Morocco',             away:'Haiti'},
  {id:52, home:'Scotland',            away:'Brazil'},
  {id:53, home:'South Africa',        away:'South Korea'},
  {id:54, home:'Czech Republic',      away:'Mexico'},
  {id:55, home:'Curacao',             away:'Ivory Coast'},
  {id:56, home:'Ecuador',             away:'Germany'},
  {id:57, home:'Tunisia',             away:'Netherlands'},
  {id:58, home:'Japan',               away:'Sweden'},
  {id:59, home:'Turkey',              away:'USA'},
  {id:60, home:'Paraguay',            away:'Australia'},
  {id:61, home:'Norway',              away:'France'},
  {id:62, home:'Senegal',             away:'Iraq'},
  {id:63, home:'Cape Verde',          away:'Saudi Arabia'},
  {id:64, home:'Uruguay',             away:'Spain'},
  {id:65, home:'New Zealand',         away:'Belgium'},
  {id:66, home:'Egypt',               away:'Iran'},
  {id:67, home:'Panama',              away:'England'},
  {id:68, home:'Croatia',             away:'Ghana'},
  {id:69, home:'Colombia',            away:'Portugal'},
  {id:70, home:'DR Congo',            away:'Uzbekistan'},
  {id:71, home:'Algeria',             away:'Austria'},
  {id:72, home:'Jordan',              away:'Argentina'},
];

// ─── Team name aliases ────────────────────────────────────────────────
// api-football may return slightly different country names.
// Add any mismatches you discover here as: 'API name': 'Your site name'
const TEAM_ALIASES = {
  'Korea Republic':          'South Korea',
  'Republic of Korea':       'South Korea',
  'Czechia':                 'Czech Republic',
  'Bosnia':                  'Bosnia & Herzegovina',
  'Bosnia-Herzegovina':      'Bosnia & Herzegovina',
  'Cote d\'Ivoire':          'Ivory Coast',
  'Côte d\'Ivoire':          'Ivory Coast',
  "Cote d'Ivoire":           'Ivory Coast',
  'United States':           'USA',
  'DR Congo':                'DR Congo',
  'Congo DR':                'DR Congo',
  'Democratic Republic of Congo': 'DR Congo',
  'Curacao':                 'Curacao',
  'Curaçao':                 'Curacao',
  'Cape Verde Islands':      'Cape Verde',
  'Cabo Verde':              'Cape Verde',
};

function normaliseTeam(name) {
  const trimmed = String(name || '').trim();
  return TEAM_ALIASES[trimmed] || trimmed;
}

// ─── Scoring logic ────────────────────────────────────────────────────
function getOutcome(home, away) {
  if (home > away) return 'H';
  if (away > home) return 'A';
  return 'D';
}

function scoreGroupMatch(actualHome, actualAway, predictedHome, predictedAway) {
  // Both scores must be valid numbers
  if (
    actualHome === null || actualHome === undefined ||
    actualAway === null || actualAway === undefined ||
    predictedHome === null || predictedHome === undefined ||
    predictedAway === null || predictedAway === undefined
  ) return { points: 0, reason: 'pending' };

  const aH = Number(actualHome), aA = Number(actualAway);
  const pH = Number(predictedHome), pA = Number(predictedAway);

  if (isNaN(aH) || isNaN(aA) || isNaN(pH) || isNaN(pA)) {
    return { points: 0, reason: 'invalid' };
  }

  const actualOutcome    = getOutcome(aH, aA);
  const predictedOutcome = getOutcome(pH, pA);

  if (actualOutcome !== predictedOutcome) {
    return { points: 0, reason: 'wrong_result' };
  }

  // Correct result
  if (aH === pH && aA === pA) {
    return { points: 10, reason: 'exact_score' };
  }

  return { points: 5, reason: 'correct_result' };
}

// ─── Fetch results from api-football ─────────────────────────────────
async function fetchCompletedFixtures() {
  const url = `https://${API_HOST}/fixtures?league=${WC2026_ID}&season=${WC2026_SEASON}&status=FT`;
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-host': API_HOST,
      'x-rapidapi-key': API_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`api-football responded with ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();

  if (!data.response || !Array.isArray(data.response)) {
    console.log('API response:', JSON.stringify(data).slice(0, 500));
    throw new Error('Unexpected api-football response structure');
  }

  console.log(`✅ api-football returned ${data.response.length} completed fixtures`);
  return data.response;
}

// ─── Build a lookup map: "HomeTeam|AwayTeam" → { homeGoals, awayGoals }
function buildResultsMap(apiFixtures) {
  const map = {};
  for (const f of apiFixtures) {
    const home = normaliseTeam(f.teams?.home?.name);
    const away = normaliseTeam(f.teams?.away?.name);
    const homeGoals = f.goals?.home;
    const awayGoals = f.goals?.away;

    if (home && away && homeGoals !== null && homeGoals !== undefined && awayGoals !== null && awayGoals !== undefined) {
      const key = `${home}|${away}`;
      map[key] = { homeGoals: Number(homeGoals), awayGoals: Number(awayGoals) };
    }
  }
  return map;
}

// ─── Match your internal fixture IDs to API results ───────────────────
function resolveResults(resultsMap) {
  const resolved = {}; // internal matchId → { homeGoals, awayGoals } | null
  for (const fx of WCP_FIXTURES) {
    const key = `${fx.home}|${fx.away}`;
    resolved[fx.id] = resultsMap[key] || null;
  }
  return resolved;
}

// ─── Calculate total points for one player's prediction ───────────────
function calcPlayerPoints(groupPredictions, resolvedResults) {
  let total = 0;
  const matchBreakdown = {}; // matchId → { points, reason, actualHome, actualAway }

  for (const pick of (groupPredictions || [])) {
    const matchId = pick.matchId;
    const actual  = resolvedResults[matchId];

    if (!actual) {
      matchBreakdown[matchId] = { points: 0, reason: 'pending' };
      continue;
    }

    const { points, reason } = scoreGroupMatch(
      actual.homeGoals,
      actual.awayGoals,
      pick.homeScore,
      pick.awayScore
    );

    total += points;
    matchBreakdown[matchId] = {
      points,
      reason,
      actualHome: actual.homeGoals,
      actualAway: actual.awayGoals,
    };
  }

  return { total, matchBreakdown };
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log('─── WCP Score Updater starting ───');
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Fetch completed results from api-football
  let apiFixtures;
  try {
    apiFixtures = await fetchCompletedFixtures();
  } catch (err) {
    console.error('❌ Failed to fetch fixtures from api-football:', err.message);
    process.exit(1);
  }

  // 2. Build result map and resolve against your fixtures
  const resultsMap     = buildResultsMap(apiFixtures);
  const resolvedResults = resolveResults(resultsMap);

  const completedCount = Object.values(resolvedResults).filter(Boolean).length;
  console.log(`📊 Matched ${completedCount} of 72 group fixtures to results`);

  if (completedCount === 0) {
    console.log('ℹ️  No completed group fixtures yet — nothing to score. Exiting.');
    return;
  }

  // Log which fixtures were matched (helps debug alias issues)
  for (const fx of WCP_FIXTURES) {
    const r = resolvedResults[fx.id];
    if (r) {
      console.log(`  ✓ Match ${fx.id}: ${fx.home} ${r.homeGoals}-${r.awayGoals} ${fx.away}`);
    }
  }

  // 3. Load all locked predictions from Firestore
  const snapshot = await db.collection('predictions')
    .where('locked', '==', true)
    .get();

  console.log(`\n👥 Found ${snapshot.size} locked predictions to score`);

  if (snapshot.empty) {
    console.log('ℹ️  No locked predictions found. Exiting.');
    return;
  }

  // 4. Score each player and batch-write back to Firestore
  const batch = db.batch();
  let updated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const { total, matchBreakdown } = calcPlayerPoints(
      data.groupPredictions || [],
      resolvedResults
    );

    // Only write if the score has actually changed (saves Firestore writes)
    if (data.totalPoints === total) continue;

    batch.update(doc.ref, {
      totalPoints:         total,
      groupMatchBreakdown: matchBreakdown, // per-match detail for Results Centre
      scoresLastUpdated:   admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`  📝 ${data.name}: ${data.totalPoints ?? 'unset'} → ${total} pts`);
    updated++;
  }

  if (updated === 0) {
    console.log('✅ All scores already up to date — no writes needed.');
    return;
  }

  await batch.commit();
  console.log(`\n✅ Updated ${updated} player scores in Firestore.`);
  console.log('─── Done ───');
}

main().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});

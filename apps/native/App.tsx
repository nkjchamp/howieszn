import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useLeague } from '@howieszn/client';
import {
  canAssignLineup, computeMatchup, getCurrentDraftTeam, scorePlayer, scoreTeam,
  type Command, type LeagueState, type Matchup, type Player, type Slot, type Team,
} from '@howieszn/domain';
import { tokens } from '@howieszn/tokens';
import { getCaptureReceipt } from './components/rosterReceipt';

const C = tokens.colors;
const SLOTS: Slot[] = ['SFLEX', 'WR', 'RB', 'TE', 'DEF/K', 'FLEX'];
const TABS = ['Home', 'Draft', 'Team', 'Matchups'] as const;
type Tab = typeof TABS[number];
type Sheet =
  | { kind: 'connection' }
  | { kind: 'player'; playerId: string }
  | { kind: 'confirm'; playerId: string; teamId: string; pickIndex: number; revision: number }
  | { kind: 'teams' }
  | { kind: 'queue' }
  | { kind: 'board' }
  | { kind: 'lineup'; teamId: string; slot: Slot; revision: number }
  | { kind: 'roster'; teamId: string; matchupId: string }
  | { kind: 'settle'; matchupId: string; revision: number }
  | { kind: 'keepPublished'; matchupId: string; revision: number }
  | null;

function Button({ title, onPress, disabled, secondary = false, danger = false }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; danger?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondaryButton,
      danger && { backgroundColor: C.danger }, (disabled || pressed) && { opacity: disabled ? 0.45 : 0.8 }]}>
    <Text style={[styles.buttonText, secondary && { color: C.green }]}>{title}</Text>
  </Pressable>;
}
function Card({ title, children, note }: { title?: string; children: React.ReactNode; note?: string }) {
  return <View style={styles.card}>{title && <Text style={styles.cardTitle}>{title}</Text>}{children}
    {note && <Text style={styles.note}>{note}</Text>}</View>;
}
function Pill({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return <View style={[styles.pill, active && { backgroundColor: C.lime }]}><Text style={styles.pillText}>{children}</Text></View>;
}
function formatScore(value: number) { return Number.isFinite(value) ? value.toFixed(2) : '—'; }
function matchLabel(round: number) { return ['Wild Card', 'Divisional', 'Conference', 'Super Bowl'][round - 1] || `Round ${round}`; }
function correctionTime(value: number) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date(value));
}

export default function App() {
  return <SafeAreaProvider><LeagueApp /></SafeAreaProvider>;
}

function LeagueApp() {
  const initialAddress = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:4000';
  const [address, setAddress] = useState(initialAddress);
  const [addressDraft, setAddressDraft] = useState(initialAddress);
  const { state, viewerId, status, loading, pending, error, send, refresh, uncertainCommand, retryLastCommand } = useLeague(address);
  const [tab, setTab] = useState<Tab>('Home');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState('ALL');
  const [showReplay, setShowReplay] = useState(false);
  const [reason, setReason] = useState('');
  const [manualWinner, setManualWinner] = useState('');
  const [localError, setLocalError] = useState('');

  const ownTeams = state?.teams.filter(team => team.managerId === viewerId) || [];
  const team = ownTeams.find(value => value.id === selectedTeamId) || ownTeams[0];
  const currentTeam = state ? getCurrentDraftTeam(state) : null;
  const commissioner = state?.managers.find(manager => manager.id === viewerId)?.commissioner || false;
  const blocked = pending || uncertainCommand || status !== 'connected';
  const playerById = useMemo(() => new Map(state?.players.map(player => [player.id, player]) || []), [state?.players]);
  const drafted = useMemo(() => new Set(state?.draft.picks.map(pick => pick.playerId).filter(Boolean) || []), [state?.draft.picks]);
  const available = useMemo(() => state?.players.filter(player => !drafted.has(player.id)
    && (position === 'ALL' || player.position === position)
    && `${player.name} ${player.nflTeam}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.rank - b.rank) || [], [state?.players, drafted, position, query]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') void refresh().catch(() => {});
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (ownTeams.length && !ownTeams.some(value => value.id === selectedTeamId)) setSelectedTeamId(ownTeams[0].id);
  }, [ownTeams.map(value => value.id).join(','), selectedTeamId]);

  async function run(command: Command, revision = state?.revision) {
    setLocalError('');
    if (uncertainCommand) { setLocalError('Confirm the previous action before making another change.'); return false; }
    try { await send(command, revision); return true; }
    catch (failure) {
      setLocalError(failure instanceof Error ? failure.message : 'The action could not be confirmed. Review the current league state.');
      return false;
    }
  }
  async function confirmPreviousAction() {
    setLocalError('');
    try { await retryLastCommand(); }
    catch (failure) { setLocalError(failure instanceof Error ? failure.message : 'The previous action is still unconfirmed.'); }
  }
  function uncertainPrompt() {
    if (!uncertainCommand) return null;
    return <View style={styles.errorBanner}>
      <Text style={styles.errorText}>The previous action may have reached the server. Confirm its outcome before making another change.</Text>
      {localError && <Text style={styles.errorText}>{localError}</Text>}
      <Button title={pending ? 'Confirming previous action…' : 'Confirm previous action'} disabled={pending}
        onPress={() => { void confirmPreviousAction(); }} />
    </View>;
  }
  function openSheet(next: Sheet) { setLocalError(''); setSheet(next); }
  function pickConfirmation(player: Player) {
    if (!state || !currentTeam || currentTeam.managerId !== viewerId) return;
    openSheet({ kind: 'confirm', playerId: player.id, teamId: currentTeam.id,
      pickIndex: state.draft.picks.length, revision: state.revision });
  }
  async function confirmDraft() {
    if (!state || sheet?.kind !== 'confirm') return;
    const snapshot = sheet;
    if (state.draft.picks.length !== snapshot.pickIndex || currentTeam?.id !== snapshot.teamId) {
      setLocalError('The turn changed. Review the current pick destination.'); return;
    }
    if (await run({ type: 'draft.pick', teamId: snapshot.teamId, playerId: snapshot.playerId,
      expectedPickIndex: snapshot.pickIndex }, snapshot.revision)) setSheet(null);
  }
  async function setLineup(playerId?: string) {
    if (!state || sheet?.kind !== 'lineup') return;
    const snapshot = sheet, source = state.teams.find(value => value.id === snapshot.teamId);
    if (!source) return;
    const lineup = { ...source.lineup };
    if (playerId) lineup[snapshot.slot] = playerId; else delete lineup[snapshot.slot];
    if (await run({ type: 'lineup.set', teamId: source.id, lineup }, snapshot.revision)) setSheet(null);
  }
  async function toggleQueue(playerId: string) {
    if (!state || !team) return;
    const queue = state.draft.queues[team.id] || [];
    await run({ type: 'draft.queue', teamId: team.id,
      playerIds: queue.includes(playerId) ? queue.filter(id => id !== playerId) : [...queue, playerId] });
  }
  async function reorderQueue(index: number, direction: number) {
    if (!state || !team) return;
    const queue = [...(state.draft.queues[team.id] || [])], destination = index + direction;
    if (destination < 0 || destination >= queue.length) return;
    [queue[index], queue[destination]] = [queue[destination], queue[index]];
    await run({ type: 'draft.queue', teamId: team.id, playerIds: queue });
  }

  const teamSelector = team && <View style={styles.teamSelector}>
    <Text style={styles.eyebrow}>VIEWING MY TEAM</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {ownTeams.map(value => <Pressable key={value.id} onPress={() => setSelectedTeamId(value.id)} accessibilityRole="button"
        accessibilityState={{ selected: team.id === value.id }} style={[styles.teamChip, team.id === value.id && styles.teamChipActive]}>
        <Text style={[styles.teamChipText, team.id === value.id && { color: C.green }]}>{value.name}</Text>
      </Pressable>)}
    </ScrollView>
  </View>;

  function replayTools() {
    if (!state || !commissioner) return null;
    return <Card>
      <Pressable accessibilityRole="button" onPress={() => setShowReplay(value => !value)} style={styles.disclosure}>
        <Text style={styles.link}>Local replay tools</Text><Text style={styles.muted}>{showReplay ? '−' : '+'}</Text>
      </Pressable>
      {showReplay && <View style={styles.stack}>
        <Text style={styles.note}>Fixture actions exercise the configured league rules. They do not supply live NFL results or a live draft clock.</Text>
        {state.draft.status === 'lobby' && <Button title="Start fixture draft" disabled={blocked} onPress={() => { void run({ type: 'draft.start' }); }} />}
        {state.draft.status === 'running' && <>
          <Button title="Autopick current team" secondary disabled={blocked} onPress={() => { void run({ type: 'draft.autopick' }); }} />
          <Button title="Fill remaining draft with fixtures" secondary disabled={blocked} onPress={() => { void run({ type: 'fixture.draftRemaining' }); }} />
        </>}
        {state.phase === 'active' && <>
          <Button title="Replay this NFL round" secondary disabled={blocked} onPress={() => { void run({ type: 'fixture.playRound' }); }} />
          <Button title="Advance settled round" secondary disabled={blocked} onPress={() => { void run({ type: 'round.advance' }); }} />
        </>}
      </View>}
    </Card>;
  }

  function home() {
    if (!state) return null;
    const pendingCorrections = state.matchups.filter(value => value.correction?.status === 'pending');
    const lineupReviews = state.matchups.filter(value => value.correction?.requiresLineupReview);
    return <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void refresh().catch(() => {}); }} />}>
      <View><Text style={styles.eyebrow}>{matchLabel(state.round).toUpperCase()}</Text><Text style={styles.hero}>Your league.{"\n"}Your next move.</Text></View>
      <Card title={state.name} note="Fixture league · Persistent local server state">
        <View style={styles.chipRow}><Pill active>{state.phase}</Pill><Pill>{state.teams.length} teams</Pill><Pill>Round {state.round}</Pill></View>
        <Text style={styles.bodyMuted}>{state.phase === 'setup' ? 'Review the league, then enter the draft.'
          : state.phase === 'draft' ? `${currentTeam?.name || 'The league'} is on the clock.`
          : state.phase === 'archived' ? 'The replay competition is complete. Your league history stays intact.'
          : 'Set your starters, follow matchups, and review each round’s outcome.'}</Text>
        <Button title={state.draft.status === 'complete' ? 'Manage my teams' : 'Open draft room'} onPress={() => setTab(state.draft.status === 'complete' ? 'Team' : 'Draft')} />
      </Card>
      {pendingCorrections.length > 0 && <Card title={`${pendingCorrections.length} correction${pendingCorrections.length === 1 ? '' : 's'} need review`}>
        <Text style={styles.bodyMuted}>Published winners and captured rosters are retained while these corrections await commissioner review.</Text>
        <Button title="Review corrections" secondary onPress={() => setTab('Matchups')} />
      </Card>}
      {lineupReviews.length > 0 && <Card title="Check affected lineups">
        <Text style={styles.bodyMuted}>A roster correction was applied. Review starters before their games lock.</Text>
        <Button title="Review my teams" secondary onPress={() => setTab('Team')} />
      </Card>}
      <Text style={styles.sectionTitle}>My teams</Text>
      {ownTeams.map(value => {
        const score = scoreTeam(state, value.id);
        return <Pressable key={value.id} accessibilityRole="button" onPress={() => { setSelectedTeamId(value.id); setTab('Team'); }}>
          <Card><View style={styles.between}><View style={styles.flex}><Text style={styles.cardTitle}>{value.name}</Text>
            <Text style={styles.note}>{value.playerIds.length} rostered · {value.eliminatedRound ? `Eliminated in round ${value.eliminatedRound}` : 'In competition'}</Text></View>
            <Text style={styles.score}>{formatScore(score.total)}</Text></View></Card>
        </Pressable>;
      })}
      {replayTools()}
      {state.audit.length > 0 && <Card title="League activity">{state.audit.slice(-4).reverse().map(event => <View key={event.id} style={styles.activityRow}>
        <Text style={styles.body}>{event.summary}</Text><Text style={styles.note}>{event.type}</Text>
      </View>)}</Card>}
    </ScrollView>;
  }

  function draftHeader() {
    if (!state) return null;
    return <View style={styles.stack}>
      <View><Text style={styles.eyebrow}>DRAFT ROOM</Text><Text style={styles.heroSmall}>{state.draft.status === 'complete' ? 'Your teams are drafted.' : 'Make the next pick count.'}</Text></View>
      <Card title={currentTeam?.name || (state.draft.status === 'complete' ? 'Draft complete' : 'Draft lobby')}>
        <View style={styles.chipRow}><Pill active>{state.draft.status}</Pill><Pill>{state.draft.picks.length}/96 picks</Pill></View>
        <Text style={styles.bodyMuted}>{currentTeam ? `${currentTeam.managerId === viewerId ? 'Your turn' : 'Another manager is picking'} · Pick ${Math.floor(state.draft.picks.length / 16) + 1}.${String(state.draft.picks.length % 16 + 1).padStart(2, '0')}` : 'Sixteen team seats. Six rounds. No initial bench.'}</Text>
        <Text style={styles.note}>The pick destination follows the turn, independently of the team you are viewing.</Text>
        <View style={styles.rowButtons}>
          <Button title="Board" secondary onPress={() => openSheet({ kind: 'board' })} />
          {commissioner && state.draft.status === 'lobby' && <Button title="Start draft" disabled={blocked} onPress={() => { void run({ type: 'draft.start' }); }} />}
          {commissioner && ['running', 'paused'].includes(state.draft.status) && <Button title={state.draft.status === 'paused' ? 'Resume' : 'Pause'} secondary disabled={blocked}
            onPress={() => { void run({ type: state.draft.status === 'paused' ? 'draft.resume' : 'draft.pause' }); }} />}
        </View>
      </Card>
      {teamSelector}
      <Button title={`Queue for ${team?.name || 'my team'}`} secondary onPress={() => openSheet({ kind: 'queue' })} />
      <TextInput accessibilityLabel="Search players" style={styles.input} placeholder="Search players or NFL team" placeholderTextColor={C.muted}
        value={query} onChangeText={setQuery} autoCapitalize="none" returnKeyType="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(value => <Pressable key={value} onPress={() => setPosition(value)} accessibilityRole="button"
          accessibilityState={{ selected: position === value }} style={[styles.filterChip, position === value && styles.teamChipActive]}>
          <Text style={styles.teamChipText}>{value}</Text></Pressable>)}
      </ScrollView>
      <Text style={styles.note}>Sample players and ranks · NFL eligibility is unverified</Text>
    </View>;
  }
  function draft() {
    return <FlatList data={available} keyExtractor={player => player.id} contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled" ListHeaderComponent={draftHeader() || undefined}
      ListFooterComponent={<View style={{ marginTop: 16 }}>{replayTools()}</View>}
      ListEmptyComponent={<Text style={styles.empty}>No available players match.</Text>}
      renderItem={({ item }) => <Pressable style={styles.playerRow} accessibilityRole="button" accessibilityLabel={`View ${item.name}, ${item.position}`}
        onPress={() => openSheet({ kind: 'player', playerId: item.id })}>
        <Text style={styles.rank}>{item.rank}</Text><View style={styles.flex}><Text style={styles.playerName}>{item.name}</Text><Text style={styles.note}>{item.position} · {item.nflTeam}</Text></View>
        <Text style={styles.link}>View</Text>
      </Pressable>} />;
  }

  function rosterRows(source: Team, editable: boolean) {
    return SLOTS.map(slot => {
      const player = playerById.get(source.lineup[slot] || '');
      return <Pressable key={slot} accessibilityRole={editable ? 'button' : undefined} disabled={!editable || blocked}
        onPress={() => state && openSheet({ kind: 'lineup', teamId: source.id, slot, revision: state.revision })}
        style={styles.lineupRow}>
        <Text style={styles.slot}>{slot}</Text><View style={styles.flex}><Text style={styles.playerName}>{player?.name || 'Empty slot'}</Text>
          <Text style={styles.note}>{player ? `${player.position} · ${player.nflTeam}` : 'Allowed by this league'}</Text></View>
        <Text style={styles.link}>{editable ? 'Edit' : ''}</Text>
      </Pressable>;
    });
  }
  function teamScreen() {
    if (!state || !team) return null;
    const score = scoreTeam(state, team.id), starters = new Set(Object.values(team.lineup));
    const shared = state.rules.benchAllocation === 'manager';
    const benchIds = shared ? state.managers.find(value => value.id === viewerId)?.benchPlayerIds || [] : team.playerIds.filter(id => !starters.has(id));
    const bench = benchIds.map(id => playerById.get(id)).filter((p): p is Player => Boolean(p));
    return <ScrollView contentContainerStyle={styles.content}>
      <View><Text style={styles.eyebrow}>MY TEAMS</Text><Text style={styles.heroSmall}>Set the lineup.{"\n"}Keep the advantage.</Text></View>
      {teamSelector}
      <Card title={team.name}><View style={styles.between}><Text style={styles.bodyMuted}>{score.provisional ? 'Provisional points' : 'Round points'}</Text><Text style={styles.score}>{formatScore(score.total)}</Text></View>
        {team.eliminatedRound && <Text style={styles.warning}>This team was eliminated in round {team.eliminatedRound}. Historical results remain available.</Text>}
        {score.issues.map((issue, i) => <Text key={i} style={styles.note}>{issue}</Text>)}
      </Card>
      <Card title="Starting lineup" note="Players whose games have started cannot be moved. Server validation determines final eligibility.">
        {rosterRows(team, state.phase === 'active' && !team.eliminatedRound)}
      </Card>
      <Card title={`${shared ? 'Manager-shared bench' : 'Team bench'} · ${bench.length}`}>
        {bench.length ? bench.map(player => <Pressable key={player.id} onPress={() => openSheet({ kind: 'player', playerId: player.id })}
          accessibilityRole="button" style={styles.lineupRow}><Pill>{player.position}</Pill><View style={styles.flex}><Text style={styles.playerName}>{player.name}</Text><Text style={styles.note}>{player.nflTeam}</Text></View></Pressable>)
          : <Text style={styles.note}>No reserves yet. Captures follow this league’s configured bench allocation.</Text>}
      </Card>
    </ScrollView>;
  }
  function correctionDetails(matchup: Matchup) {
    const correction = matchup.correction;
    if (!state || !correction) return null;
    const correctedWinner = state.teams.find(value => value.id === correction.proposedWinnerTeamId)?.name;
    return <View style={styles.correctionComparison}>
      <Text style={styles.cardTitle}>{correction.status === 'applied' ? 'Correction applied' : correction.status === 'kept' ? 'Published result retained' : 'Correction needs review'}</Text>
      <Text style={styles.note}>{correction.reason}</Text>
      <Text style={styles.note}>Previously published → Corrected statistics</Text>
      {matchup.teamIds.map((id, index) => <View key={id} style={styles.between}>
        <Text style={[styles.note, styles.flex]}>{state.teams.find(value => value.id === id)?.name}</Text>
        <Text style={styles.playerName}>{formatScore(correction.previousScores[index])} → {formatScore(correction.proposedScores[index])}</Text>
      </View>)}
      <Text style={styles.note}>{correctedWinner ? `Corrected statistics favor ${correctedWinner}.` : 'The corrected statistics do not identify a winner.'}</Text>
      <Text style={styles.note}>{correction.status === 'applied' ? 'The published result above reflects this correction.' : 'The published winner and captured roster have not been automatically changed.'}</Text>
      {correction.windowClosesAt !== null && <Text style={styles.note}>Correction window: {correctionTime(correction.windowClosesAt)} · {correction.nextRoundStarted ? 'Next NFL round started' : 'Next NFL round not started'}</Text>}
      {correction.requiresLineupReview && <Text style={styles.warning}>Review affected next-round lineups. Players whose games started remain locked.</Text>}
      {correction.decisionReason && <Text style={styles.note}>Commissioner decision: {correction.decisionReason}</Text>}
      {correction.status === 'pending' && commissioner && <Button title="Review keeping published result" secondary disabled={blocked}
        onPress={() => { setReason(''); openSheet({ kind: 'keepPublished', matchupId: matchup.id, revision: state.revision }); }} />}
    </View>;
  }

  function matchups() {
    if (!state) return null;
    return <ScrollView contentContainerStyle={styles.content}>
      <View><Text style={styles.eyebrow}>{matchLabel(state.round).toUpperCase()}</Text><Text style={styles.heroSmall}>Every win changes{"\n"}your next round.</Text></View>
      {state.matchups.filter(value => value.round === state.round || Boolean(value.correction)).sort((a, b) => Number(b.correction?.status === 'pending') - Number(a.correction?.status === 'pending') || b.round - a.round).map(matchup => {
        const result = computeMatchup(state, matchup.id), sides = matchup.teamIds.map(id => state.teams.find(value => value.id === id)!);
        const publishedScores = matchup.scoreAtSettlement;
        const displayScores = publishedScores || result.scores;
        const hasCorrectedScores = publishedScores?.some((value, index) => Math.abs(value - result.scores[index]) > 0.001) || false;
        return <Card key={matchup.id}>
          <View style={styles.between}><Pill active={matchup.status === 'settled'}>{matchup.status}</Pill><Text style={styles.note}>Round {matchup.round}</Text></View>
          <Text style={styles.eyebrow}>{publishedScores ? 'PUBLISHED RESULT' : 'CURRENT STATISTICS'}</Text>
          {sides.map((side, index) => <View key={side.id} style={styles.matchSide}><View style={styles.flex}><Text style={styles.playerName}>{side.name}</Text>
            <Text style={styles.note}>{result.survivingStarters[index]} starting players still in NFL playoffs</Text></View>
            <Text style={styles.score}>{formatScore(displayScores[index])}</Text></View>)}
          {matchup.status === 'review' && <Text style={styles.warning}>A correction needs commissioner review. Published results and corrected statistics are shown separately.</Text>}
          {correctionDetails(matchup)}
          {hasCorrectedScores && !matchup.correction && <View style={styles.correctionComparison}><Text style={styles.cardTitle}>Corrected statistics</Text>{sides.map((side, index) => <View style={styles.between} key={side.id}><Text style={[styles.note, styles.flex]}>{side.name}</Text><Text style={styles.playerName}>{formatScore(result.scores[index])}</Text></View>)}<Text style={styles.note}>These corrected totals do not by themselves change the published winner or captured roster.</Text></View>}
          {result.issues.slice(0, 3).map((issue, i) => <Text style={styles.note} key={i}>{issue}</Text>)}
          {matchup.winnerTeamId && <View style={styles.stack}><Text style={styles.bodyMuted}>Published winner: {state.teams.find(value => value.id === matchup.winnerTeamId)?.name} · {matchup.capturedPlayerIds.length} inherited players</Text>
            <Button title="View full new roster" secondary onPress={() => openSheet({ kind: 'roster', teamId: matchup.winnerTeamId!, matchupId: matchup.id })} /></View>}
          {commissioner && matchup.status !== 'settled' && matchup.status !== 'review' && result.status !== 'provisional' && <Button
            title="Review replay settlement" secondary disabled={blocked} onPress={() => { setReason(''); setManualWinner(result.winnerTeamId || ''); openSheet({ kind: 'settle', matchupId: matchup.id, revision: state.revision }); }} />}
        </Card>;
      })}
      {!state.matchups.some(value => value.round === state.round) && <Card><Text style={styles.note}>Matchups become available when the fixture draft is complete.</Text></Card>}
      {replayTools()}
    </ScrollView>;
  }

  function sheetContent() {
    if (sheet?.kind === 'connection') return <View style={styles.stack}><Text style={styles.modalTitle}>Connect to your server</Text>
      <Text style={styles.bodyMuted}>On a phone, use the computer’s reachable address. The local API must be available to this device.</Text>
      <TextInput accessibilityLabel="API server address" style={styles.input} value={addressDraft} onChangeText={setAddressDraft} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <Button title="Connect" onPress={() => {
        try { const url = new URL(addressDraft); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); setAddress(addressDraft.replace(/\/$/, '')); setSheet(null); }
        catch { setLocalError('Enter a valid http or https server address.'); }
      }} /></View>;
    if (!sheet || !state) return null;
    if (sheet.kind === 'teams') return <View style={styles.stack}><Text style={styles.modalTitle}>My teams</Text>{ownTeams.map(value => <Button key={value.id} title={value.name} secondary onPress={() => { setSelectedTeamId(value.id); setSheet(null); }} />)}</View>;
    if (sheet.kind === 'player') {
      const player = playerById.get(sheet.playerId); if (!player) return null;
      const picked = state.draft.picks.some(value => value.playerId === player.id), score = scorePlayer(state, player.id);
      return <View style={styles.stack}><Pill>{player.position} · {player.nflTeam}</Pill><Text style={styles.modalTitle}>{player.name}</Text>
        <Text style={styles.bodyMuted}>Sample rank {player.rank} · {formatScore(score.total)} round points</Text>
        {score.parts.map((part, index) => <View key={index} style={styles.between}><Text style={styles.body}>{part.label}</Text><Text style={styles.body}>{formatScore(part.points)}</Text></View>)}
        {score.issues.map((issue, index) => <Text key={index} style={styles.note}>{issue}</Text>)}
        {!picked && currentTeam && <Card title="Pick destination"><Text style={styles.playerName}>{currentTeam.name}</Text><Text style={styles.note}>Viewing another team does not redirect this pick.</Text></Card>}
        {!picked && <Button title={currentTeam?.managerId === viewerId ? `Draft for ${currentTeam.name}` : 'Waiting for your turn'}
          disabled={blocked || state.draft.status !== 'running' || currentTeam?.managerId !== viewerId} onPress={() => pickConfirmation(player)} />}
        {!picked && team && <Button title={`${(state.draft.queues[team.id] || []).includes(player.id) ? 'Remove from queue' : 'Queue'} · ${team.name}`}
          secondary disabled={blocked || state.draft.status === 'complete'} onPress={() => { void toggleQueue(player.id); }} />}
        {picked && <Text style={styles.note}>Already drafted · {state.draft.picks.find(value => value.playerId === player.id)?.source}</Text>}
      </View>;
    }
    if (sheet.kind === 'confirm') {
      const player = playerById.get(sheet.playerId), destination = state.teams.find(value => value.id === sheet.teamId), stale = state.revision !== sheet.revision;
      return <View style={styles.stack}><Text style={styles.eyebrow}>CONFIRM YOUR PICK</Text><Text style={styles.modalTitle}>{player?.name}</Text><Pill>{player?.position} · {player?.nflTeam}</Pill>
        <View style={styles.destination}><Text style={styles.note}>DRAFTING FOR</Text><Text style={styles.heroSmall}>{destination?.name}</Text></View>
        {team?.id !== sheet.teamId && <Text style={styles.note}>You are viewing {team?.name}. This pick belongs to {destination?.name}.</Text>}
        {stale && <Text style={styles.warning}>The league changed while you reviewed. Check the current player and destination before confirming again.</Text>}
        <Button title={pending ? 'Submitting…' : 'Confirm pick'} disabled={blocked || stale} onPress={() => { void confirmDraft(); }} />
        <Button title="Review current player" secondary onPress={() => openSheet({ kind: 'player', playerId: sheet.playerId })} />
      </View>;
    }
    if (sheet.kind === 'queue') {
      const queue = team ? state.draft.queues[team.id] || [] : [];
      return <View style={styles.stack}><Text style={styles.modalTitle}>Queue · {team?.name}</Text><Text style={styles.note}>This queue belongs to the viewed team, not every team you manage.</Text>
        {queue.map((id, index) => { const player = playerById.get(id); return <View key={id} style={styles.queueRow}>
          <Text style={styles.rank}>{index + 1}</Text><View style={styles.flex}><Text style={styles.playerName}>{player?.name}</Text><Text style={styles.note}>{player?.position} · {player?.nflTeam}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Move ${player?.name} up`} disabled={blocked || index === 0} style={styles.iconButton} onPress={() => { void reorderQueue(index, -1); }}><Text>↑</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Move ${player?.name} down`} disabled={blocked || index === queue.length - 1} style={styles.iconButton} onPress={() => { void reorderQueue(index, 1); }}><Text>↓</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${player?.name} from queue`} disabled={blocked} style={styles.iconButton} onPress={() => { void toggleQueue(id); }}><Text>×</Text></Pressable>
        </View>; })}
        {!queue.length && <Text style={styles.empty}>Your queue is empty. Add players from their detail sheet.</Text>}
      </View>;
    }
    if (sheet.kind === 'board') return <View style={styles.stack}><Text style={styles.modalTitle}>Confirmed picks</Text><Text style={styles.note}>{state.draft.picks.length} of 96 picks</Text>
      {state.draft.picks.slice().reverse().map(pick => <View key={pick.index} style={styles.lineupRow}><Text style={styles.rank}>{pick.round}.{String(pick.index % 16 + 1).padStart(2, '0')}</Text>
        <View style={styles.flex}><Text style={styles.playerName}>{playerById.get(pick.playerId || '')?.name || 'Passed'}</Text><Text style={styles.note}>{state.teams.find(value => value.id === pick.teamId)?.name} · {pick.source}</Text></View></View>)}
      {!state.draft.picks.length && <Text style={styles.empty}>No accepted picks yet.</Text>}</View>;
    if (sheet.kind === 'lineup') {
      const source = state.teams.find(value => value.id === sheet.teamId); if (!source) return null;
      const stale = state.revision !== sheet.revision;
      const sharedIds = state.rules.benchAllocation === 'manager' ? state.managers.find(value => value.id === source.managerId)?.benchPlayerIds || [] : [];
      const candidateIds = [...new Set([...source.playerIds, ...sharedIds])];
      const candidates: (Player | undefined)[] = [undefined, ...candidateIds.map(id => playerById.get(id)).filter((p): p is Player => Boolean(p))];
      return <View style={styles.stack}><Text style={styles.eyebrow}>{source.name}</Text><Text style={styles.modalTitle}>Choose {sheet.slot}</Text>
        {stale && <><Text style={styles.warning}>The league changed. Refresh these choices before changing the lineup.</Text><Button title="Review updated choices" secondary onPress={() => openSheet({ ...sheet, revision: state.revision })} /></>}
        {candidates.map(player => {
          const lineup = { ...source.lineup }; if (player) lineup[sheet.slot] = player.id; else delete lineup[sheet.slot];
          const valid = canAssignLineup(state, source.id, lineup, Date.now());
          return <Pressable key={player?.id || 'empty'} accessibilityRole="button" disabled={blocked || stale || !valid.ok}
            style={[styles.choice, (!valid.ok || stale) && { opacity: 0.45 }]} onPress={() => { void setLineup(player?.id); }}>
            <Text style={styles.playerName}>{player?.name || 'Leave empty'}</Text><Text style={styles.note}>{player ? `${player.position} · ${player.nflTeam}` : 'No starter in this slot'}{!valid.ok ? ` · ${valid.error}` : ''}</Text>
          </Pressable>;
        })}
      </View>;
    }
    if (sheet.kind === 'roster') {
      const source = state.teams.find(value => value.id === sheet.teamId);
      const matchup = state.matchups.find(value => value.id === sheet.matchupId);
      if (!source || !matchup) return <Text style={styles.warning}>This historical roster record is unavailable.</Text>;
      const receipt = getCaptureReceipt(matchup, source.id);
      if (receipt.kind === 'winner-changed') return <View style={styles.stack}>
        <Text style={styles.modalTitle}>The published winner changed</Text>
        <Text style={styles.bodyMuted}>Review the current published capture rather than the earlier winner’s roster.</Text>
        <Button title="View current published roster" onPress={() => openSheet({ kind: 'roster', teamId: receipt.winnerTeamId, matchupId: matchup.id })} />
      </View>;
      if (receipt.kind === 'unavailable') return <View style={styles.stack}>
        <Text style={styles.modalTitle}>{source.name}</Text>
        <Text style={styles.warning}>The settlement roster receipt is unavailable in this record. Today’s roster cannot reconstruct that past capture.</Text>
      </View>;
      const shared = state.rules.benchAllocation === 'manager';
      const before = new Set(receipt.beforeIds);
      function receiptRows(ids: string[], inherited: boolean) {
        return ids.map(id => { const player = playerById.get(id); return <View key={id} style={styles.lineupRow}>
          <Pill>{player?.position || 'Unknown'}</Pill><View style={styles.flex}>
            <Text style={styles.playerName}>{player?.name || 'Unknown historical player'}</Text>
            <Text style={styles.note}>{player?.nflTeam || 'Source unavailable'} · {inherited ? 'Inherited at this win' : 'Rostered before this win'}</Text>
          </View>
        </View>; });
      }
      return <View style={styles.stack}>
        <Text style={styles.modalTitle}>{source.name}</Text>
        <Text style={styles.note}>Round {matchup.round} capture receipt · {receipt.allIds.length} players · Natural positions</Text>
        <Text style={styles.bodyMuted}>This receipt preserves the roster at that win. Later captures or eliminations do not rewrite it.</Text>
        <Text style={styles.cardTitle}>Winning team before capture</Text>
        {receiptRows(receipt.beforeIds, false)}
        <Text style={styles.cardTitle}>{shared ? 'Inherited manager-shared reserves' : 'Inherited team players'}</Text>
        {receiptRows(receipt.capturedIds.filter(id => !before.has(id)), true)}
        {source.managerId === viewerId && source.eliminatedRound === null && <Button title="Open current lineup"
          onPress={() => { setSelectedTeamId(source.id); setTab('Team'); setSheet(null); }} />}
      </View>;
    }
    if (sheet.kind === 'keepPublished') {
      const matchup = state.matchups.find(value => value.id === sheet.matchupId);
      if (!matchup) return null;
      const stale = state.revision !== sheet.revision;
      const winner = state.teams.find(value => value.id === matchup.winnerTeamId)?.name || 'No published winner';
      return <View style={styles.stack}>
        <Text style={styles.eyebrow}>COMMISSIONER REVIEW</Text><Text style={styles.modalTitle}>Keep the published result</Text>
        <Text style={styles.bodyMuted}>{winner} remains the published winner. The existing captured roster will be retained, and this decision will be recorded.</Text>
        <TextInput accessibilityLabel="Correction decision reason" multiline style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
          placeholder="Reason for keeping the published result" placeholderTextColor={C.muted} value={reason} onChangeText={setReason} />
        {stale && <Text style={styles.warning}>The league changed. Close and review the latest correction.</Text>}
        <Button title="Record decision" disabled={blocked || stale || !reason.trim() || matchup.correction?.status !== 'pending'} onPress={() => {
          void run({ type: 'matchup.keepPublished', matchupId: matchup.id, reason: reason.trim() }, sheet.revision).then(ok => { if (ok) setSheet(null); });
        }} />
      </View>;
    }
    if (sheet.kind === 'settle') {
      const matchup = state.matchups.find(value => value.id === sheet.matchupId); if (!matchup) return null;
      const result = computeMatchup(state, matchup.id), stale = state.revision !== sheet.revision;
      return <View style={styles.stack}><Text style={styles.eyebrow}>LOCAL REPLAY DECISION</Text><Text style={styles.modalTitle}>Review advancement</Text>
        <Text style={styles.bodyMuted}>Settlement transfers the losing team’s configured roster. Automatic corrections stop when the configured window closes or the next NFL round starts.</Text>
        {matchup.teamIds.map(id => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected: manualWinner === id }}
          disabled={Boolean(result.winnerTeamId) || stale} onPress={() => setManualWinner(id)} style={[styles.choice, manualWinner === id && styles.teamChipActive]}>
          <Text style={styles.playerName}>{state.teams.find(value => value.id === id)?.name}</Text>
          <Text style={styles.note}>{id === result.winnerTeamId ? 'Computed winner' : result.winnerTeamId ? 'Defeated team' : 'Select only after reviewing the unresolved tie'}</Text>
        </Pressable>)}
        <TextInput accessibilityLabel="Settlement reason" multiline style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
          placeholder="Reason for this replay decision" placeholderTextColor={C.muted} value={reason} onChangeText={setReason} />
        {stale && <Text style={styles.warning}>The result changed. Close and review the current matchup.</Text>}
        <Button title="Settle replay result" disabled={blocked || stale || !manualWinner || !reason.trim()} onPress={() => {
          void run({ type: 'matchup.settle', matchupId: matchup.id, winnerTeamId: manualWinner, reason: reason.trim() }, sheet.revision).then(ok => { if (ok) setSheet(null); });
        }} />
      </View>;
    }
    return null;
  }

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.header}><View style={styles.brand}><View style={styles.brandMark}><Text style={styles.brandLetter}>h</Text></View><Text style={styles.brandName}>howieszn</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Connection settings" onPress={() => { setAddressDraft(address); openSheet({ kind: 'connection' }); }}><Text style={[styles.connection, { color: status === 'connected' ? C.green : C.warning }]}>{status}</Text></Pressable>
    </View>
    <View style={styles.preview}><Text style={styles.previewText}>LOCAL PREVIEW · Fixture sports data · No live NFL feed</Text></View>
    {!sheet && uncertainPrompt()}
    {(error || localError) && !sheet && !uncertainCommand && <View style={styles.errorBanner}><Text style={styles.errorText}>{localError || error?.message}</Text><Pressable accessibilityRole="button" onPress={() => { setLocalError(''); void refresh().catch(() => {}); }}><Text style={styles.link}>Refresh</Text></Pressable></View>}
    {loading && !state ? <View style={styles.center}><ActivityIndicator color={C.green} /><Text style={styles.bodyMuted}>Connecting to your league…</Text></View>
      : !state ? <View style={[styles.center, styles.content]}><Text style={styles.heroSmall}>Your league is a connection away.</Text><Text style={styles.bodyMuted}>Start the local API, then connect this device to its reachable address.</Text><Button title="Connection settings" onPress={() => openSheet({ kind: 'connection' })} /><Button title="Retry" secondary onPress={() => { void refresh().catch(() => {}); }} /></View>
      : <View style={styles.flex}>{tab === 'Home' ? home() : tab === 'Draft' ? draft() : tab === 'Team' ? teamScreen() : matchups()}</View>}
    <SafeAreaView edges={['bottom']} style={styles.tabSafe}><View style={styles.tabs}>{TABS.map(value => <Pressable key={value} accessibilityRole="tab"
      accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabSelected]}><Text style={[styles.tabText, tab === value && { color: C.green }]}>{value}</Text></Pressable>)}</View></SafeAreaView>
    <Modal visible={Boolean(sheet)} animationType="slide" transparent onRequestClose={() => setSheet(null)}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom']} style={styles.modalCard}><View style={styles.modalHeader}><Text style={styles.eyebrow}>{state?.name || 'HOWIESZN PREVIEW'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={() => setSheet(null)} style={styles.close}><Text style={styles.link}>Close</Text></Pressable></View>
          {uncertainPrompt()}
          {localError && !uncertainCommand && <Text accessibilityRole="alert" style={styles.modalError}>{localError}</Text>}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>{sheetContent()}</ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper }, flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: C.line },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandMark: { width: 30, height: 30, borderRadius: 8, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  brandLetter: { color: C.lime, fontSize: 21, fontWeight: '800' }, brandName: { fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.6 }, connection: { fontSize: 12, fontWeight: '600', paddingVertical: 8 },
  preview: { backgroundColor: '#e9ede5', paddingHorizontal: 16, paddingVertical: 8 }, previewText: { color: C.muted, fontSize: 10, textAlign: 'center', letterSpacing: 0.3 },
  content: { padding: 18, gap: 16, paddingBottom: 28 }, stack: { gap: 14 }, card: { backgroundColor: C.white, borderColor: C.line, borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '600', color: C.ink }, sectionTitle: { fontSize: 18, fontWeight: '600', color: C.ink }, hero: { color: C.ink, fontSize: 34, lineHeight: 38, fontWeight: '600', letterSpacing: -1 },
  heroSmall: { color: C.ink, fontSize: 27, lineHeight: 31, fontWeight: '600', letterSpacing: -0.7 }, eyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700', color: C.green, marginBottom: 6 },
  body: { color: C.ink, fontSize: 14, lineHeight: 21 }, bodyMuted: { color: C.muted, fontSize: 14, lineHeight: 21 }, note: { color: C.muted, fontSize: 11, lineHeight: 16 }, muted: { color: C.muted },
  chipRow: { flexDirection: 'row', gap: 7, flexWrap: 'nowrap' }, pill: { backgroundColor: '#eff3e9', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, alignSelf: 'flex-start' }, pillText: { color: C.ink, fontSize: 11, fontWeight: '500' },
  button: { backgroundColor: C.green, minHeight: 46, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: C.green },
  secondaryButton: { backgroundColor: C.white, borderColor: C.line }, buttonText: { color: C.white, fontSize: 13, fontWeight: '600', textAlign: 'center' }, link: { color: C.green, fontWeight: '600', fontSize: 12 },
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, color: C.ink, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, minHeight: 46, fontSize: 14 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, score: { color: C.ink, fontSize: 24, fontWeight: '600', fontVariant: ['tabular-nums'] },
  rowButtons: { gap: 8, flexDirection: 'row', flexWrap: 'wrap' }, teamSelector: { gap: 5 }, teamChip: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9 },
  teamChipActive: { backgroundColor: '#eaf2df', borderColor: C.green }, teamChipText: { color: C.ink, fontSize: 12, fontWeight: '600' }, filterChip: { backgroundColor: C.white, borderColor: C.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderColor: C.line }, rank: { color: C.muted, fontSize: 11, minWidth: 23 }, playerName: { fontSize: 14, lineHeight: 20, color: C.ink, fontWeight: '600' },
  lineupRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderColor: C.line }, slot: { color: C.muted, width: 45, fontSize: 10, fontWeight: '600' },
  matchSide: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line }, warning: { fontSize: 12, lineHeight: 18, color: C.warning, backgroundColor: '#fbf2df', padding: 12, borderRadius: 8 },
  activityRow: { gap: 3, paddingVertical: 9, borderBottomWidth: 1, borderColor: C.line }, disclosure: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 },
  empty: { color: C.muted, fontSize: 13, lineHeight: 20, paddingVertical: 20 }, center: { flex: 1, alignItems: 'stretch', justifyContent: 'center', gap: 16, padding: 24 },
  tabSafe: { backgroundColor: C.white, borderTopWidth: 1, borderColor: C.line }, tabs: { flexDirection: 'row', padding: 8, gap: 5 }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 45, borderRadius: 9 }, tabSelected: { backgroundColor: '#edf4e4' }, tabText: { fontSize: 12, color: C.muted, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: '#14241c77', justifyContent: 'flex-end' }, modalCard: { maxHeight: '92%', backgroundColor: C.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10, borderBottomWidth: 1, borderColor: C.line }, close: { minHeight: 38, minWidth: 48, justifyContent: 'center', alignItems: 'flex-end' }, modalContent: { padding: 20, gap: 14, paddingBottom: 28 },
  modalTitle: { color: C.ink, fontWeight: '600', fontSize: 27, lineHeight: 31, letterSpacing: -0.6 }, destination: { backgroundColor: '#eaf2df', padding: 18, borderRadius: 13, gap: 5 },
  choice: { borderWidth: 1, borderColor: C.line, borderRadius: 11, backgroundColor: C.white, padding: 14, gap: 4 }, queueRow: { flexDirection: 'row', gap: 7, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line },
  iconButton: { width: 34, height: 40, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  correctionComparison: { backgroundColor: '#f0f3ea', borderRadius: 10, padding: 13, gap: 10 },
  errorBanner: { backgroundColor: '#faeae5', paddingHorizontal: 18, paddingVertical: 10, gap: 7 }, errorText: { color: C.danger, fontSize: 12, lineHeight: 18 }, modalError: { color: C.danger, fontSize: 12, lineHeight: 18, marginHorizontal: 20, marginTop: 10 },
});

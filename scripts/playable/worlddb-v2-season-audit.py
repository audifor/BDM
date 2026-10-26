"""Recheck every certified result, acta and standing without replaying any match."""
import json
from collections import Counter
from pathlib import Path

root=Path('.worlddb-v2')
source=next(p/'season-complete.json' for p in sorted(root.glob('season-02-*'),reverse=True) if (p/'season-complete.json').exists())
s=json.loads(source.read_text(encoding='utf-8'))['payload']
history=s['seasonHistoryBySeasonId'][0]
games=s['games']; logs=s['matchStatLogs']; by_id={log['gameId']:log for log in logs}
assert len(games)==len({g['id'] for g in games})==328
assert len(logs)==len(by_id)==328
points=Counter();against=Counter();wins=Counter();played=Counter();pairs=Counter()
for g in games:
    assert g['status']=='completed'
    log=by_id[g['id']]
    assert log['finalScore']==dict(home=g['result']['homeScore'],away=g['result']['awayScore'])
    assert log['resolution'] in ['FULL','FAST'], 'No aggregate/background substitutions in this certificate'
    for side,other in [('home','away'),('away','home')]:
        team=g[side+'TeamId']; score=g['result'][side+'Score']; conceded=g['result'][other+'Score']
        assert sum(line['stats']['points'] for line in log['playerLines'] if line['teamId']==team)==score
        if g['competitionStageKey']=='REGULAR':
            played[team]+=1;points[team]+=score;against[team]+=conceded;wins[team]+=int(score>conceded)
    if g['competitionStageKey']=='REGULAR':pairs[(g['homeTeamId'],g['awayTeamId'])]+=1
assert len(pairs)==306 and all(n==1 for n in pairs.values())
assert len(played)==18 and all(n==34 for n in played.values())
for row in history['finalStandings']:
    team=row['teamId']
    assert (row['played'],row['wins'],row['losses'],row['pointsFor'],row['pointsAgainst'],row['pointDifference'])==(played[team],wins[team],played[team]-wins[team],points[team],against[team],points[team]-against[team])
assert history['championSource']=='postseason' and history['championTeamId']=='pbm:DYN_equipe:50'
result=dict(passed=True,source=str(source),regular_games=306,postseason_games=22,actas=328,exact_engine_games=328,
            per_club_regular=34,standings_match_all_recorded_scores=True,unique_directed_pairs=306,
            champion=history['championTeamId'],champion_source=history['championSource'],completed_on=history['completedOn'],
            injuries=len(s['injuries']),scheduled_training_sessions=len(s['scheduledTrainingSessions']),development_stimulus_events=len(s['developmentStimulusEvents']),expense_recognitions=len(s['expenseRecognitions']))
target=Path('docs/playable/evidence/worlddb-v2-02/season-audit.json');target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))

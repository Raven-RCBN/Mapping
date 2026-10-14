import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
old=json.loads((root/'data/rainfall/oban-rainfall.json').read_text())
# Transcribed from the user-supplied comparative monthly rainfall screenshot.
series={
2026:([8,82,156,277,310,468,464,824,803,None,None,None],[3,6,8,13,16,20,30,27,25,None,None,None],3392,148),
2025:([33,62,244,309,341,427,994,406,768,341,259,81],[2,5,9,16,16,19,26,28,26,23,16,2],4265,188),
2024:([None,71,199,180,274,562,428,256,544,700,179,59],[0,3,11,19,22,25,26,24,27,27,10,2],3453,196),
2023:([13,None,144,156,298,518,814,312,397,673,344,1],[2,0,19,19,19,25,28,26,24,28,19,1],3669,210),
2022:([None,None,120,352,404,474,521,497,588,561,66,0],[0,0,8,19,20,22,28,23,29,25,7,0],3584,181),
2021:([3,None,193,264,282,647,305,288,581,239,114,10],[1,0,13,18,13,20,15,24,18,20,14,2],2926,158),
2020:([0,0,101,335,387,357,833,327,809,413,232,22],[0,0,10,15,22,20,28,16,29,21,10,2],3816,173),
2019:([39,88,28,208,571,755,783,342,801,743,290,40],[2,4,18,14,16,24,28,11,20,24,17,3],4688,181),
2018:([0,114,122,182,189,550,875,673,644,351,282,27],[0,11,11,12,20,24,23,22,21,19,11,1],4009,175),
2017:([64,0,28,233,233,555,355,207,271,346,118,55],[5,0,4,17,21,29,25,23,23,20,7,1],2465,175)}
records=[]
for year,(amounts,days,total,total_days) in sorted(series.items()):
 if sum(x or 0 for x in amounts)!=total: print('Source discrepancy',year,'reported mm',total,'monthly sum',sum(x or 0 for x in amounts))
 if sum(x or 0 for x in days)!=total_days: print('Source discrepancy',year,'reported days',total_days,'monthly sum',sum(x or 0 for x in days))
 monthly=[{'month':i+1,'mm':mm,'rainDays':days[i],'status':'not_supplied' if year==2026 and i>=9 else 'NR' if mm is None else 'recorded'} for i,mm in enumerate(amounts)]
 records.append(dict(year=year,mm=total,rainDays=total_days,fromMonth=1,toMonth=9 if year==2026 else 12,partial=year==2026,period='Jan–Sep 2026 · YTD' if year==2026 else 'Jan–Dec · reported total',monthly=monthly,monthlySumMm=sum(x or 0 for x in amounts),monthlySumRainDays=sum(x or 0 for x in days)))
payload={**old,'sourceId':'comparative-rainfall-20261015','sourceName':'Supplied comparative monthly rainfall statistics 2017–2026','sourceFile':'Screenshot 2026-10-15 at 3.34.59 AM.png','records':records,'note':'Local preview. New screenshot supersedes the overlapping 2017–2021 values from the earlier source. NR remains unknown; displayed annual totals are reported totals. 2026 Oct–Dec not supplied.'}
(root/'data/rainfall/oban-rainfall-through-sep2026.json').write_text(json.dumps(payload,indent=2))
print('Checked all 10 rainfall totals and rain-day totals; 2026 Jan–Sep: 3,392 mm / 148 days.')

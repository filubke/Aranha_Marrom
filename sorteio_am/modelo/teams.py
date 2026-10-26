import pandas as pd, numpy as np
from load import df
line=df[df.team.isin(['Branco','Azul','Preto'])&~df.is_gk]
td=line.groupby(['dia','team']).agg(V=('vit','median'),E=('emp','median'),n=('atleta','size')).reset_index()
td['pts']=3*td.V+td.E
td['L']=6-td.V-td.E
d=td.groupby('dia').agg(spread=('pts','max'),mn=('pts','min'),sd=('pts','std'),totV=('V','sum'),totE=('E','sum')).reset_index()
d['spread']=d.spread-d.mn
d['era']=np.where(d.dia>=pd.Timestamp('2026-07-18'),'pos','pre')
print(d.to_string())
print(td.groupby(td.dia.ge('2026-07-18')).agg(V=('V','mean'),E=('E','mean'),L=('L','mean')))
print(d.groupby('era').agg(n=('dia','size'),spread=('spread','mean'),sd=('sd','mean'),E=('totE','mean'),V=('totV','mean')))
# draws per day: each draw involves 2 teams => totE/2 games drawn out of 9
for era,g in d.groupby('era'):
    print(era,'draw rate', (g.totE.sum()/2)/(9*len(g)))
# simulate equal-strength days
rng=np.random.default_rng(1)
def sim(pdraw,n=20000):
    out=[]
    for _ in range(n):
        pts=np.zeros(3)
        pairs=[(0,1),(0,2),(1,2)]*3
        for a,b in pairs:
            u=rng.random()
            if u<pdraw: pts[a]+=1;pts[b]+=1
            elif u<pdraw+(1-pdraw)/2: pts[a]+=3
            else: pts[b]+=3
        out.append((pts.max()-pts.min(),pts.std(ddof=1)))
    o=np.array(out); return o.mean(0)
for era,g in d.groupby('era'):
    pdr=(g.totE.sum()/2)/(9*len(g))
    print(era,'noise-only spread/sd',sim(pdr))

print('----')
d['var']=d.sd**2
d['games']=d.totV+d.totE/2
print(d[d.games!=9][['dia','games']].to_string())
rng=np.random.default_rng(2)
def simvar(pdraw,n=20000):
    v=[]
    for _ in range(n):
        pts=np.zeros(3)
        for a,b in [(0,1),(0,2),(1,2)]*3:
            u=rng.random()
            if u<pdraw: pts[a]+=1;pts[b]+=1
            elif u<pdraw+(1-pdraw)/2: pts[a]+=3
            else: pts[b]+=3
        v.append(pts.var(ddof=1))
    return np.mean(v)
nv=simvar(0.2)
for era,g in d[d.games==9].groupby('era'):
    print(era,len(g),'mean var',g['var'].mean().round(2),'noise var',round(nv,2),'excess share',round(1-nv/g['var'].mean(),2))

print('====')
g9=d[d.games==9]
a=g9[g9.era=='pre']['var'].values; b=g9[g9.era=='pos']['var'].values
obs=a.mean()-b.mean()
allv=np.concatenate([a,b]); rng=np.random.default_rng(3); c=0
for _ in range(20000):
    rng.shuffle(allv); c+= (allv[:len(a)].mean()-allv[len(a):].mean())>=obs
print('diff',obs,'p one-sided',c/20000)

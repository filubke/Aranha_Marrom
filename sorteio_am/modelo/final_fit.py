import numpy as np, pandas as pd, json
from model import *
KW=dict(lam=6,lam_b=200)
skill,beta,Xp=fit(valid_days,**KW)
D,y,_=design(valid_days)
res=y-D@skill
dof=len(y)-3
s2=(res**2).sum()/ (len(y)-0.6*P if len(y)>0.6*P else len(y))
# posterior sd of u
A=D.T@D+KW['lam']*np.eye(P)
Ainv=np.linalg.inv(A)
sig_e=np.sqrt(s2)
post_sd=sig_e*np.sqrt(np.diag(Ainv))
prior_sd=sig_e/np.sqrt(KW['lam'])
print('beta',beta.round(2),'sig_e',sig_e.round(2),'prior_sd',prior_sd.round(2))
dias=line.groupby('atleta').dia.nunique()
tab=pd.DataFrame({'atleta':players,'skill':skill,'sd':np.minimum(post_sd,prior_sd),'dias':[dias[p] for p in players]})
print(tab.sort_values('skill',ascending=False).round(2).to_string())
print('range',skill.min().round(2),skill.max().round(2),'team sum sd',np.std([ (D[:3]@skill) ]).round(2))
tab.to_pickle('skills.pkl')
# validation: imbalance actual vs random, leave-one-day-out ratings
rng=np.random.default_rng(5)
out=[]
for d in valid_days:
    tr=[x for x in valid_days if x!=d]
    s,_,_=fit(tr,**KW)
    teams={t:roster[(d,t)] for t in TEAMS}
    act=np.std([s[teams[t]].sum() for t in TEAMS],ddof=1)
    allp=np.array(sum(teams.values(),[]))
    sizes=[len(teams[t]) for t in TEAMS]
    rs=[]
    for _ in range(400):
        pm=rng.permutation(allp); a=0; ss=[]
        for z in sizes: ss.append(s[pm[a:a+z]].sum()); a+=z
        rs.append(np.std(ss,ddof=1))
    out.append((d,act,np.mean(rs),(np.array(rs)<=act).mean()))
o=pd.DataFrame(out,columns=['dia','act','rand','pct']); o['era']=np.where(o.dia>=pd.Timestamp('2026-07-18'),'pos','pre')
print(o.groupby('era').agg(n=('dia','size'),act=('act','mean'),rand=('rand','mean'),pct=('pct','mean')))
o.to_pickle('valid_imb.pkl')

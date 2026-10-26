import pandas as pd, numpy as np
from load import df
line=df[df.team.isin(['Branco','Azul','Preto'])&~df.is_gk].copy()
TEAMS=['Branco','Azul','Preto']
# team-day table
td=line.groupby(['dia','team']).agg(V=('vit','median'),E=('emp','median'),GF=('gols','sum')).reset_index()
td['pts']=3*td.V+td.E
games=td.groupby('dia').apply(lambda g:g.V.sum()+g.E.sum()/2)
valid_days=[d for d in sorted(td.dia.unique()) if games[d]==9 and td[td.dia==d].shape[0]==3]
players=sorted(line.atleta.unique()); pidx={p:i for i,p in enumerate(players)}
P=len(players)
roster={}  # (dia,team)->list idx
for (d,t),g in line.groupby(['dia','team']): roster[(d,t)]=[pidx[a] for a in g.atleta]
# per player-day stats
pd_stats=line[['dia','atleta','gols','assist','zc']].copy()
def features(train_days):
    s=pd_stats[pd_stats.dia.isin(train_days)]
    nz=s[~s.zc]
    a=nz.groupby('atleta').agg(n=('dia','nunique'),g=('gols','sum'),a=('assist','sum'))
    mg=a.g.sum()/a.n.sum(); ma=a.a.sum()/a.n.sum(); k=4
    allp=s.groupby('atleta').agg(n=('dia','nunique'),zc=('zc','sum'))
    X=np.zeros((P,3))
    for p in players:
        i=pidx[p]
        if p in a.index:
            X[i,0]=(a.g[p]+k*mg)/(a.n[p]+k)-mg; X[i,1]=(a.a[p]+k*ma)/(a.n[p]+k)-ma
        if p in allp.index:
            X[i,2]=(allp.zc[p]+1)/(allp.n[p]+2)-0.4
    # unseen players: zeros
    return X
def design(days,X=None):
    rows=[];y=[];yg=[]
    for d in days:
        sub=td[td.dia==d].set_index('team')
        M=np.zeros((3,P))
        for k,t in enumerate(TEAMS):
            for i in roster.get((d,t),[]): M[k,i]=1
        M=M-M.mean(0)  # center across teams
        pts=sub.loc[TEAMS,'pts'].values; gf=sub.loc[TEAMS,'GF'].values
        rows.append(M); y.append(pts-pts.mean()); yg.append(gf-gf.mean())
    return np.vstack(rows),np.concatenate(y),np.concatenate(yg)
def fit(train_days,lam=20,lam_b=5,use_feat=True,use_u=True,alpha=0.0,w=None):
    Xp=features(train_days)
    D,y,yg=design(train_days)
    sdp=y.std(); sdg=yg.std()
    yt=(1-alpha)*y+alpha*(yg/sdg*sdp)
    beta=np.zeros(3)
    if use_feat:
        F=D@Xp
        beta=np.linalg.solve(F.T@F+lam_b*np.eye(3),F.T@yt)
    prior=Xp@beta
    r=yt-D@prior
    u=np.zeros(P)
    if use_u:
        A=D.T@D+lam*np.eye(P)
        u=np.linalg.solve(A,D.T@r)
    return prior+u,beta,Xp
def predict(skill,days):
    D,y,_=design(days); return D@skill,y
def lodo(**kw):
    pr=[];ys=[]
    for d in valid_days:
        tr=[x for x in valid_days if x!=d]
        s,_,_=fit(tr,**kw); p,y=predict(s,[d]); pr.append(p);ys.append(y)
    pr=np.concatenate(pr);ys=np.concatenate(ys)
    return 1-((ys-pr)**2).sum()/((ys)**2).sum(), np.corrcoef(pr,ys)[0,1]
def expanding(start=10,**kw):
    pr=[];ys=[]
    for i in range(start,len(valid_days)):
        tr=valid_days[:i]; d=valid_days[i]
        s,_,_=fit(tr,**kw); p,y=predict(s,[d]); pr.append(p);ys.append(y)
    pr=np.concatenate(pr);ys=np.concatenate(ys)
    return 1-((ys-pr)**2).sum()/((ys)**2).sum(), np.corrcoef(pr,ys)[0,1]
if __name__=='__main__':
    print(len(valid_days),'valid days',P,'players')
    print('cfg  LODO(R2,corr)  EXP(R2,corr)')
    for name,kw in [('feat only',dict(use_u=False)),('ridge only l=5',dict(use_feat=False,lam=5)),('ridge only l=20',dict(use_feat=False,lam=20)),
                    ('feat+u l=10',dict(lam=10)),('feat+u l=20',dict(lam=20)),('feat+u l=40',dict(lam=40)),('feat+u l=80',dict(lam=80)),
                    ('feat+u l=20 a=.5',dict(lam=20,alpha=.5)),('feat+u l=40 a=.5',dict(lam=40,alpha=.5)),('feat+u l=40 a=1',dict(lam=40,alpha=1.0))]:
        print(name, np.round(lodo(**kw),3), np.round(expanding(**kw),3))

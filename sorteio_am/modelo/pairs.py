import numpy as np, pandas as pd, itertools
from model import *
KW=dict(lam=6,lam_b=200)
Ds=[];Ys=[]
for d in valid_days:
    D,y,_=design([d]); Ds.append(D); Ys.append(y)
D=np.vstack(Ds); y=np.concatenate(Ys)
lam=6
def fit_u(y): return np.linalg.solve(D.T@D+lam*np.eye(P),D.T@y)
u=fit_u(y); res=y-D@u
sig=np.sqrt((res**2).sum()/(len(y)-0.6*P)); print('sig',sig)
# team-day membership list in same order as rows
rows=[(d,t) for d in valid_days for t in TEAMS]
def pair_stats(res,minn=4):
    acc={}
    for k,(d,t) in enumerate(rows):
        ps=sorted(roster[(d,t)])
        for a,b in itertools.combinations(ps,2):
            acc.setdefault((a,b),[]).append(k)
    out=[]
    for (a,b),ks in acc.items():
        if len(ks)>=minn:
            m=res[ks].mean(); out.append((a,b,len(ks),m,m/(sig/np.sqrt(len(ks)))))
    return out
obs=pair_stats(res)
print('pares com n>=4:',len(obs))
df_=pd.DataFrame(obs,columns=['a','b','n','res','t']); df_['A']=df_.a.map(lambda i:players[i]); df_['B']=df_.b.map(lambda i:players[i])
# raw numbers
ptsraw=np.concatenate([td[td.dia==d].set_index('team').loc[TEAMS,'pts'].values for d in valid_days])
Vraw=np.concatenate([td[td.dia==d].set_index('team').loc[TEAMS,'V'].values for d in valid_days])
Eraw=np.concatenate([td[td.dia==d].set_index('team').loc[TEAMS,'E'].values for d in valid_days])
rank={}
def lookup(A,B):
    a,b=sorted([pidx[A],pidx[B]]); ks=[k for k,(d,t) in enumerate(rows) if a in roster[(d,t)] and b in roster[(d,t)]]
    return ks
for A,B in [('Alexandre','Eliel'),('Adriano','Eliel')]:
    ks=lookup(A,B)
    print(A,B,'juntos',len(ks),'dias; pts/dia',ptsraw[ks].mean().round(2) if ks else None,'V',Vraw[ks].sum() if ks else None,'E',Eraw[ks].sum() if ks else None,'jogos',6*len(ks),'| res médio',res[ks].mean().round(2) if ks else None)
    # each individually apart
    for P_,Q in [(A,B),(B,A)]:
        i=pidx[P_]; j=pidx[Q]
        ka=[k for k,(d,t) in enumerate(rows) if i in roster[(d,t)] and j not in roster[(d,t)]]
        print('  ',P_,'sem',Q,len(ka),'dias pts/dia',ptsraw[ka].mean().round(2))
# permutation null
rng=np.random.default_rng(1); mins=[];cnt=[]
for _ in range(200):
    yp=np.concatenate([yy[rng.permutation(3)] for yy in Ys]); up=fit_u(yp); rp=yp-D@up
    st=pair_stats(rp); ts=np.array([s[4] for s in st]); mins.append(ts.min()); cnt.append((ts<-2).sum())
mins=np.array(mins);cnt=np.array(cnt)
print('null min t: mean',mins.mean().round(2),'p05',np.quantile(mins,.05).round(2),' null #pairs t<-2: mean',cnt.mean().round(1))
print('obs min t',df_.t.min().round(2),' obs #pairs t<-2',(df_.t<-2).sum())
top=df_.sort_values('t').head(12)
rows_out=[]
for _,r in top.iterrows():
    ks=lookup(r.A,r.B); rows_out.append((r.A,r.B,int(r.n),round(ptsraw[ks].mean(),1),int(Vraw[ks].sum()),int(Eraw[ks].sum()),int(6*len(ks)-Vraw[ks].sum()-Eraw[ks].sum()),round(r.res,2),round(r.t,2),round((mins<=r.t).mean(),2)))
print(pd.DataFrame(rows_out,columns=['A','B','n','pts/dia','V','E','D','res','t','p_maxperm']).to_string())
df_.to_pickle('pairs.pkl')

import pandas as pd, numpy as np
from load import df
pd.set_option('display.width',250); pd.set_option('display.max_rows',500)
line=df[df.team.isin(['Branco','Azul','Preto'])&~df.is_gk]
gk=df[df.is_gk]
g=line.groupby('atleta').agg(dias=('dia','nunique'),gols=('gols','sum'),ast=('assist','sum'),zc=('zc','sum')).reset_index()
g['gk_dias']=g.atleta.map(gk.groupby('atleta').dia.nunique()).fillna(0).astype(int)
extra=gk.groupby('atleta').dia.nunique()
for a in extra.index:
    if a not in set(g.atleta): g.loc[len(g)]=[a,0,0,0,0,extra[a]]
g=g.fillna(0)
# shrinkage on non-ZC days (offense measured only when not playing ZC? use all days)
nz=line[~line.zc].groupby('atleta').agg(dias_nz=('dia','nunique'),gols_nz=('gols','sum'),ast_nz=('assist','sum')).reset_index()
g=g.merge(nz,on='atleta',how='left').fillna({'dias_nz':0,'gols_nz':0,'ast_nz':0})
pool=g[g.dias_nz>0]
mg=pool.gols_nz.sum()/pool.dias_nz.sum(); ma=pool.ast_nz.sum()/pool.dias_nz.sum()
k=4
g['g_s']=(g.gols_nz+k*mg)/(g.dias_nz+k); g['a_s']=(g.ast_nz+k*ma)/(g.dias_nz+k)
g['share']=g.g_s/(g.g_s+g.a_s)
g['zc_rate']=np.where(g.dias>0,g.zc/g.dias.replace(0,np.nan),np.nan)
g['zc_post']=(g.zc+1)/(g.dias+2)   # beta(1,1) posterior mean
print('means',mg,ma)
def role(r):
    if r.dias==0 or r.gk_dias>=max(3,r.dias): return 'Goleiro'
    if r.zc_rate>=0.5: return 'Zagueiro'
    if r.g_s>=1.7 or (r.g_s>=1.4 and r.share>=0.6 and False): return 'Atacante'
    return 'Meia'
g['pos']=g.apply(role,axis=1)
g['conf']=np.where(g.dias+g.gk_dias>=10,'alta',np.where(g.dias+g.gk_dias>=5,'média','baixa'))
print(g.sort_values(['pos','dias'],ascending=[True,False])[['atleta','dias','gk_dias','zc','zc_rate','dias_nz','gols_nz','ast_nz','g_s','a_s','share','pos','conf']].round(2).to_string())
g.to_pickle('g.pkl')

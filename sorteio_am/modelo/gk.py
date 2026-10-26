import pandas as pd, numpy as np
from load import df
gk=df[df.is_gk].copy()
n=gk.groupby('dia').atleta.transform('size')
gk['games']=np.where(n==3,6,9)
gk['pts']=3*gk.vit+gk.emp
print((gk.vit+gk.emp>gk.games).sum(),'rows exceeding games')
print(gk[gk.vit+gk.emp>gk.games][['dia','atleta','vit','emp','games']])
gk['post']=gk.dia>=pd.Timestamp('2026-07-18')
agg=gk.groupby('atleta').agg(dias=('dia','nunique'),games=('games','sum'),pts=('pts','sum'),
   gsof=('gsof','sum'),games_post=('games',lambda s:s[gk.loc[s.index,'post']].sum())).reset_index()
agg['ppg']=agg.pts/agg.games
agg['gsof_pg']=agg.gsof/agg.games_post.replace(0,np.nan)
mean_ppg=agg.pts.sum()/agg.games.sum()
k=27  # pseudo-games (~3 days)
agg['ppg_s']=(agg.pts+k*mean_ppg)/(agg.games+k)
agg['rating']=6*(agg.ppg_s-mean_ppg)   # pts por sábado se jogasse os 6 jogos do time
agg['sd']=6*np.sqrt( (1.6**2) /(agg.games+k) )  # sd de ppg por jogo ~? aprox abaixo
print('mean ppg',mean_ppg)
print(agg.sort_values('rating',ascending=False).round(2).to_string())
agg.to_pickle('gk.pkl')
# crude significance: chi-sq style on ppg across GK with >=10 days using per-game variance ~ var of pts per game

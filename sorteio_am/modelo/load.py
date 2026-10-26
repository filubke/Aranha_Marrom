import csv, io, re, sys
import pandas as pd
SRC='../dados/bola_de_ouro_2026_export.txt'
txt=open(SRC,encoding='utf-8').read().split('\n')
# sheet 2026: lines 2..803 (1-indexed) -> idx 1..802
rows=list(csv.reader(txt[1:803]))
hdr=rows[0]; data=rows[1:]
MON={'Jan':1,'Feb':2,'Mar':3,'Apr':4,'May':5,'Jun':6,'Jul':7,'Aug':8,'Sep':9,'Oct':10,'Nov':11,'Dec':12}
def pdate(s):
    s=s.strip()
    m=re.match(r'(\d+)/([A-Za-z]{3})/(\d{4})',s)
    if m: return pd.Timestamp(int(m[3]),MON[m[2]],int(m[1]))
    m=re.match(r'(\d+)/(\d+)/(\d+)',s)
    if m:
        d,mo,y=int(m[1]),int(m[2]),int(m[3]); y= y+2000 if y<100 else y
        return pd.Timestamp(y,mo,d)
    return pd.NaT
def num(x):
    x=x.strip()
    if x=='' : return 0.0
    try: return float(x)
    except: return 0.0
NAMEMAP={'Fábio':'Fabio','Kaue':'Kauê','Gk':'GK','Thiago benato':'Thiago Benato','Thiago Benato ':'Thiago Benato','Petty':'Pety','Elias Jr.':'Elias','Bruno F.':'Bruno F'}
recs=[]
for r in data:
    if len(r)<5 or not r[4].strip(): continue
    r=r+['']*(17-len(r))
    nm=r[4].strip(); nm=NAMEMAP.get(nm,nm)
    recs.append(dict(dia=pdate(r[1]),team=r[3].strip(),atleta=nm,gols=num(r[5]),assist=num(r[6]),vit=num(r[7]),emp=num(r[8]),assid=num(r[9]),
      falta=num(r[10]),zag_raw=r[11].strip(),bonus=num(r[12]),gsof=num(r[13]),total=num(r[14]),marker=r[15].strip(),ptsteam=num(r[16]),extra=r[17:]))
df=pd.DataFrame(recs)
df['zc']=(df.zag_raw!='')|(df.marker=='ZC')
df['is_gk']=(df.team=='Goleiro')|(df.marker=='Goleiro')
df['team']=df.team.replace({'Marrom':'Preto'})
if __name__=='__main__':
    print(len(df), df.dia.min(), df.dia.max(), df.dia.nunique())
    print(df.team.value_counts())
    print(df.marker.value_counts())
    print(df[df.extra.apply(len)>0][['dia','atleta','extra']])
    print(df.dia.isna().sum())
    print(df.groupby('atleta').size().sort_values(ascending=False).to_string())

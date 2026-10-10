import json, numpy as np
from PIL import Image, ImageFilter
meta=json.load(open('pw/cur1920/meta.json'))
res=[]
for id,m in sorted(meta.items(), key=lambda x:int(x[0])):
    n=f"{int(id):03d}"
    r=Image.open(f'ref/i/{n}.jpg').convert('RGB').filter(ImageFilter.GaussianBlur(2.5)); c=Image.open(f'pw/cur1920/{n}.png').convert('RGB').filter(ImageFilter.GaussianBlur(2.5))
    d=np.abs(np.asarray(r,dtype=int)-np.asarray(c,dtype=int)).max(axis=2)
    mask=d>24
    pct=mask.mean()*100
    if mask.any():
        ys,xs=np.where(mask); bb=(xs.min(),ys.min(),xs.max(),ys.max())
    else: bb=None
    res.append((int(id),m['s'],m['tab'],m['theme'],round(pct,3),bb))
res.sort(key=lambda x:-x[4])
print('max',res[0][4]); 
ok=[x for x in res if x[4]<0.1]; print(len(ok),'<0.1%')
for x in res:
    if x[4]>0: print(x)


Backend
Gereksinimler

Docker Desktop kurulu ve açık olmalı.
Kontrol etmek için docker --version
İlk Kurulum
    cd 496bitirme
    docker compose up --build

Yeni bir terminal aç migration çalıştır:

docker compose exec backend python manage.py migrate

health apisini test et status ok yazmalı(alttaki linkten)
http://127.0.0.1:8000/api/health/

normal kullanıumda projeyi çalıştırmak için :
docker compose up

yine kontrol için bu adres
http://127.0.0.1:8000/api/health/

migration çalıştırılcağı durumlar
    Yeni model eklendiğinde
    Git pull yaptıktan sonra yeni migration geldiyse


migration komutu:
docker compose exec backend python manage.py migrate

durdurmak için:
docker compose down  bu  veritabanını silmez.

eğer şu komut kullanılırsa:

docker compose down -v

veritabanı tamamen silinir ve migration tekrar çalıştırılmalıdır.

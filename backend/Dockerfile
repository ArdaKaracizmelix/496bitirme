FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y gcc postgresql-client

COPY requirements.txt /app/

RUN pip install --upgrade pip
RUN pip install -r requirements.txt
#okulda bak bi de şöyle deneyelim RUN pip install -r /app/requirements.txt

COPY . /app/

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

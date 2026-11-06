FROM python:3.12-slim
WORKDIR /app
COPY app.py schema.json index.html app.js style.css ./
ENV COMEX_DB=/data/comex.sqlite3 COMEX_HOST=0.0.0.0 PYTHONUNBUFFERED=1
RUN mkdir -p /data && useradd -r -u 10001 -d /app comex && chown -R comex:comex /app /data
USER comex
EXPOSE 8080
CMD ["python","app.py","serve","--host","0.0.0.0","--port","8080"]

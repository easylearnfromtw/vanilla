FROM mcr.microsoft.com/playwright/python:v1.58.0-noble
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY policy.py app.py ./
RUN useradd --create-home --uid 10001 weiguo && chown -R weiguo:weiguo /app
USER weiguo
ENV PYTHONDONTWRITEBYTECODE=1
EXPOSE 8080
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8080","--workers","1"]

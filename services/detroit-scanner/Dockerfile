FROM python:3.12-slim
WORKDIR /app
COPY server.py /app/server.py
RUN useradd --uid 10001 --create-home athena
USER athena
EXPOSE 8788
CMD ["python", "-u", "/app/server.py"]
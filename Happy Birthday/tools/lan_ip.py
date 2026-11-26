# -*- coding: utf-8 -*-
"""Печатает локальный IPv4-адрес компьютера в Wi-Fi/локальной сети."""
import socket

ip = ""

try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # UDP-connect не отправляет пакеты, но подсказывает нужный сетевой интерфейс
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    finally:
        s.close()
except Exception:
    try:
        ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        ip = ""

if ip.startswith("127.") or ip.startswith("169.254."):
    ip = ""

print(ip)

FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf
# Копируем собранную папку dist (так как у тебя Vite)
COPY client/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]